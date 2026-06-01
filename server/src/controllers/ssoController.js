const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const UserModel = require('../models/User');

const LORA_CONFIG = {
    privateKey: process.env.LORA_PRIVATE_KEY || 'CNTanHiep#SSO@Lora',
    partner: process.env.LORA_PARTNER || 'cntanhiep',
    baseURL: process.env.LORA_BASE_URL || 'http://lora.tanhiepwtp.vn:5555/SSO/SSOAuth.aspx',
};

// Client URL để redirect sau khi SSO thành công
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

/**
 * Tính key SSO theo đặc tả LORA:
 * B1: normalize time — bỏ ':', '-', '.', ' ' (giữ '_')
 * B2: a = MD5(us + normalizedTime + privateKey)[0:15]
 * B3: key = MD5(a + normalizedTime + partner + privateKey)
 */
function buildLoraKey(loraUsername, time) {
    const normalizedTime = time.replace(/[:\-. ]/g, '');

    const a = crypto
        .createHash('md5')
        .update(loraUsername + normalizedTime + LORA_CONFIG.privateKey)
        .digest('hex')
        .substring(0, 15);

    const key = crypto
        .createHash('md5')
        .update(a + normalizedTime + LORA_CONFIG.partner + LORA_CONFIG.privateKey)
        .digest('hex');

    return { key, normalizedTime };
}

/**
 * Parse time string từ SSO param (yyyyMMdd_HHmmss.ttt hoặc yyyyMMdd_HHmmss777)
 * sang Date object để kiểm tra replay attack.
 */
function parseLoraTime(time) {
    // normalize về dạng: yyyyMMddHHmmss
    const t = time.replace(/[:\-_. ]/g, '');
    const y = t.slice(0, 4), mo = t.slice(4, 6), d = t.slice(6, 8);
    const h = t.slice(8, 10), mi = t.slice(10, 12), s = t.slice(12, 14);
    return new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`);
}

const ssoController = {
    /**
     * GET /api/auth/sso
     * PUBLIC — không cần JWT
     * Params: us, time, partner, key
     *
     * Flow:
     * 1. Validate params
     * 2. Verify key bằng MD5
     * 3. Kiểm tra time không quá cũ (5 phút)
     * 4. Tìm user theo loraUsername
     * 5. Issue JWT → redirect client /sso-callback?token=...
     */
    async verifySso(req, res) {
        const { us, time, partner, key } = req.query;

        if (!us || !time || !partner || !key) {
            return res.status(400).json({ success: false, message: 'Thiếu tham số SSO' });
        }

        if (partner !== LORA_CONFIG.partner) {
            return res.status(403).json({ success: false, message: 'Partner không hợp lệ' });
        }

        // Kiểm tra time không quá 5 phút (chống replay attack)
        try {
            const loginTime = parseLoraTime(time);
            const diffMs = Date.now() - loginTime.getTime();
            if (diffMs > 5 * 60 * 1000 || diffMs < -60 * 1000) {
                return res.status(403).json({ success: false, message: 'Yêu cầu SSO đã hết hạn' });
            }
        } catch {
            return res.status(400).json({ success: false, message: 'Định dạng time không hợp lệ' });
        }

        // Verify key
        const { key: expectedKey } = buildLoraKey(us, time);
        if (expectedKey !== key) {
            return res.status(403).json({ success: false, message: 'Key SSO không hợp lệ' });
        }

        // Tìm user theo loraUsername
        const user = await UserModel.findByLoraUsername(us);
        if (!user) {
            // Redirect về trang 2 lựa chọn ASP.NET kèm thông báo lỗi
            const errorUrl =
                `${LORA_CONFIG.baseURL}` +
                `?us=${encodeURIComponent(us)}` +
                `&time=${encodeURIComponent(time)}` +
                `&partner=${encodeURIComponent(partner)}` +
                `&key=${encodeURIComponent(key)}` +
                `&error=${encodeURIComponent('Tài khoản ' + us + ' không có trên hệ thống năng lượng Vi_Power')}`;
            return res.redirect(errorUrl);
        }

        // Issue JWT
        const token = jwt.sign(
            { userId: user._id, username: user.username, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '15m' },
        );

        const refreshToken = require('crypto').randomBytes(40).toString('hex');
        const activeUntil = new Date(Date.now() + 15 * 60 * 1000);
        await Promise.all([
            UserModel.setRefreshToken(user._id, refreshToken),
            UserModel.updateActiveStatus(user._id, true, activeUntil),
            UserModel.incrementLoginCount(user._id),
        ]);

        // Redirect về client kèm token
        const callbackUrl =
            `${CLIENT_URL}/sso-callback` +
            `?token=${encodeURIComponent(token)}` +
            `&refreshToken=${encodeURIComponent(refreshToken)}`;

        res.redirect(callbackUrl);
    },

    /**
     * GET /api/auth/sso/lora
     * PROTECTED — cần JWT
     * Tạo URL SSO để mở hệ thống LORA trong tab mới
     */
    async getLoraUrl(req, res) {
        try {
            const user = await UserModel.findById(req.user._id);

            if (!user?.loraUsername) {
                return res.status(400).json({
                    success: false,
                    message: 'Tài khoản chưa được mapping với hệ thống LORA',
                });
            }

            const now = new Date();
            const pad = (n, len = 2) => String(n).padStart(len, '0');
            const time =
                `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_` +
                `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.` +
                `${pad(now.getMilliseconds(), 3)}`;

            const { key } = buildLoraKey(user.loraUsername, time);

            const url =
                `${LORA_CONFIG.baseURL}` +
                `?us=${encodeURIComponent(user.loraUsername)}` +
                `&time=${time}` +
                `&partner=${LORA_CONFIG.partner}` +
                `&key=${key}`;

            res.json({ success: true, url });
        } catch (err) {
            console.error('SSO LORA error:', err);
            res.status(500).json({ success: false, message: 'Không thể tạo SSO URL' });
        }
    },
};

module.exports = ssoController;
