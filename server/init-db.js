require("dotenv").config();
const { MongoClient, ObjectId } = require("mongodb");
const bcrypt = require("bcrypt");

const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/vi_power";
const client = new MongoClient(uri);

async function initDatabase() {
  try {
    await client.connect();
    const db = client.db();

    console.log("🚀 Initializing ViPower database...\n");

    // Drop database nếu cần (cho development)
    if (process.env.NODE_ENV === "development") {
      await db.dropDatabase();
      console.log("🗑️  Dropped existing database");
    }

    // ==================== TẠO COLLECTIONS ====================
    console.log("\n📁 Creating collections...");

    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map((c) => c.name);

    const requiredCollections = [
      "users",
      "displaygroup",
      "user_group",
      "devices",
      "alerts",
      "api_logs",
      // BỎ 'reports' ra
    ];

    for (const colName of requiredCollections) {
      if (!collectionNames.includes(colName)) {
        await db.createCollection(colName);
        console.log(`✅ Created collection: ${colName}`);
      } else {
        console.log(`📦 Collection already exists: ${colName}`);
      }
    }

    // ==================== TẠO INDEXES ====================
    console.log("\n📊 Creating indexes...");

    // Users indexes
    await db.collection("users").createIndex({ username: 1 }, { unique: true });
    await db.collection("users").createIndex({ role: 1 });
    console.log("✅ Created users indexes");

    // DisplayGroup indexes
    await db
      .collection("displaygroup")
      .createIndex({ displaygrouid: 1 }, { unique: true });
    await db.collection("displaygroup").createIndex({ name: 1 });
    console.log("✅ Created displaygroup indexes");

    // User_Group indexes
    await db
      .collection("user_group")
      .createIndex({ username: 1, displaygrouid: 1 }, { unique: true });
    await db.collection("user_group").createIndex({ displaygrouid: 1 });
    await db.collection("user_group").createIndex({ username: 1 });
    console.log("✅ Created user_group indexes");

    // Devices indexes
    await db
      .collection("devices")
      .createIndex({ deviceid: 1 }, { unique: true });
    await db.collection("devices").createIndex({ status: 1 });
    await db.collection("devices").createIndex({ deviceType: 1 });
    await db.collection("devices").createIndex({ displaygroupid: 1 });
    await db.collection("devices").createIndex({ location: 1 });
    console.log("✅ Created devices indexes");

    // Alerts indexes
    await db.collection("alerts").createIndex({ timestamp: -1 });
    await db.collection("alerts").createIndex({ deviceId: 1 });
    await db.collection("alerts").createIndex({ severity: 1 });
    await db.collection("alerts").createIndex({ resolved: 1 });
    await db.collection("alerts").createIndex({ alertType: 1 });
    console.log("✅ Created alerts indexes");

    // API Logs indexes
    await db.collection("api_logs").createIndex({ timestamp: -1 });
    await db.collection("api_logs").createIndex({ endpoint: 1 });
    await db.collection("api_logs").createIndex({ method: 1 });
    await db.collection("api_logs").createIndex({ statusCode: 1 });
    await db.collection("api_logs").createIndex({ userId: 1 });
    console.log("✅ Created api_logs indexes");

    // ==================== TẠO USERS MẪU ====================
    console.log("\n👤 Creating sample users...");

    const usersCount = await db.collection("users").countDocuments();
    if (usersCount === 0) {
      const hashedAdminPass = await bcrypt.hash("admin123", 10);
      const hashedEngineerPass = await bcrypt.hash("engineer123", 10);
      const hashedSupervisorPass = await bcrypt.hash("supervisor123", 10);
      const hashedOperatorPass = await bcrypt.hash("operator123", 10);
      const hashedViewerPass = await bcrypt.hash("viewer123", 10);

      const users = [
        {
          _id: new ObjectId(),
          username: "admin",
          password: hashedAdminPass,
          fullName: "Nguyễn Văn Admin",
          role: "Admin",
          email: "admin@vipower.vn",
          phone: "0987654321",
          department: "IT",
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          _id: new ObjectId(),
          username: "engineer1",
          password: hashedEngineerPass,
          fullName: "Trần Thị Kỹ Sư",
          role: "Engineer",
          email: "engineer1@vipower.vn",
          phone: "0912345678",
          department: "Kỹ thuật",
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          _id: new ObjectId(),
          username: "supervisor1",
          password: hashedSupervisorPass,
          fullName: "Lê Văn Giám Sát",
          role: "Supervisor",
          email: "supervisor1@vipower.vn",
          phone: "0923456789",
          department: "Quản lý",
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          _id: new ObjectId(),
          username: "operator1",
          password: hashedOperatorPass,
          fullName: "Phạm Thị Vận Hành",
          role: "Operator",
          email: "operator1@vipower.vn",
          phone: "0934567890",
          department: "Vận hành",
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          _id: new ObjectId(),
          username: "viewer1",
          password: hashedViewerPass,
          fullName: "Hoàng Văn Xem",
          role: "Viewer",
          email: "viewer1@vipower.vn",
          phone: "0945678901",
          department: "Quan sát",
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      await db.collection("users").insertMany(users);
      console.log(`✅ Created ${users.length} sample users`);
    } else {
      console.log(`📊 Users collection already has ${usersCount} documents`);
    }

    // ==================== TẠO DISPLAY GROUPS MẪU ====================
    console.log("\n🏷️  Creating sample display groups...");

    const groupsCount = await db.collection("displaygroup").countDocuments();
    if (groupsCount === 0) {
      const displayGroups = [
        {
          _id: new ObjectId(),
          displaygrouid: "GROUP001",
          name: "Khu Xử Lý Nước Thải A",
          note: "Khu vực xử lý nước thải chính - Gồm hệ thống bơm, lọc và xử lý hóa học",
          color: "#FF6B6B",
          icon: "water",
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          _id: new ObjectId(),
          displaygrouid: "GROUP002",
          name: "Trạm Biến Áp Chính",
          note: "Trạm biến áp trung tâm - Cung cấp điện cho toàn nhà máy",
          color: "#4ECDC4",
          icon: "bolt",
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          _id: new ObjectId(),
          displaygrouid: "GROUP003",
          name: "Hệ Thống Điều Khiển PLC",
          note: "Hệ thống điều khiển tự động - PLC và SCADA",
          color: "#45B7D1",
          icon: "chip",
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          _id: new ObjectId(),
          displaygrouid: "GROUP004",
          name: "Khu Vực Sản Xuất",
          note: "Khu vực sản xuất chính - Máy móc và thiết bị sản xuất",
          color: "#96CEB4",
          icon: "factory",
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          _id: new ObjectId(),
          displaygrouid: "GROUP005",
          name: "Hệ Thống Chiếu Sáng",
          note: "Hệ thống chiếu sáng toàn nhà máy",
          color: "#FFEAA7",
          icon: "light",
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      await db.collection("displaygroup").insertMany(displayGroups);
      console.log(`✅ Created ${displayGroups.length} display groups`);
    } else {
      console.log(
        `📊 Display groups collection already has ${groupsCount} documents`,
      );
    }

    // ==================== TẠO USER_GROUP MẪU ====================
    console.log("\n👥 Creating sample user groups...");

    const userGroupsCount = await db.collection("user_group").countDocuments();
    if (userGroupsCount === 0) {
      const userGroups = [
        // Admin có quyền truy cập tất cả groups
        { displaygrouid: "GROUP001", username: "admin", createdAt: new Date() },
        { displaygrouid: "GROUP002", username: "admin", createdAt: new Date() },
        { displaygrouid: "GROUP003", username: "admin", createdAt: new Date() },
        { displaygrouid: "GROUP004", username: "admin", createdAt: new Date() },
        { displaygrouid: "GROUP005", username: "admin", createdAt: new Date() },

        // Engineer truy cập technical groups
        {
          displaygrouid: "GROUP001",
          username: "engineer1",
          createdAt: new Date(),
        },
        {
          displaygrouid: "GROUP002",
          username: "engineer1",
          createdAt: new Date(),
        },
        {
          displaygrouid: "GROUP003",
          username: "engineer1",
          createdAt: new Date(),
        },

        // Supervisor truy cập management groups
        {
          displaygrouid: "GROUP001",
          username: "supervisor1",
          createdAt: new Date(),
        },
        {
          displaygrouid: "GROUP004",
          username: "supervisor1",
          createdAt: new Date(),
        },

        // Operator truy cập operation groups
        {
          displaygrouid: "GROUP001",
          username: "operator1",
          createdAt: new Date(),
        },
        {
          displaygrouid: "GROUP004",
          username: "operator1",
          createdAt: new Date(),
        },

        // Viewer chỉ xem
        {
          displaygrouid: "GROUP001",
          username: "viewer1",
          createdAt: new Date(),
        },
        {
          displaygrouid: "GROUP002",
          username: "viewer1",
          createdAt: new Date(),
        },
        {
          displaygrouid: "GROUP005",
          username: "viewer1",
          createdAt: new Date(),
        },
      ];

      await db.collection("user_group").insertMany(userGroups);
      console.log(`✅ Created ${userGroups.length} user-group relationships`);
    } else {
      console.log(
        `📊 User groups collection already has ${userGroupsCount} documents`,
      );
    }

    // ==================== TẠO DEVICES MẪU ====================
    console.log("\n🔧 Creating sample devices...");

    const devicesCount = await db.collection("devices").countDocuments();
    if (devicesCount === 0) {
      const devices = [
        // GROUP001 - Khu Xử Lý Nước Thải A
        {
          _id: new ObjectId(),
          deviceid: "PMP001",
          deviceName: "Bơm Chính 1",
          deviceType: "bơm",
          location: "Khu Xử Lý A - Tầng 1",
          coordinates: { x: 150, y: 280 },
          samplingCycle: 30,
          status: "active",
          displaygroupid: "GROUP001",
          manufacturer: "Grundfos",
          model: "CR 45-3",
          installationDate: new Date("2023-01-15"),
          lastMaintenance: new Date("2023-12-01"),
          nextMaintenance: new Date("2024-06-01"),
          powerRating: 22.5, // kW
          voltage: 380, // V
          currentRating: 42, // A
          description: "Bơm ly tâm trục ngang - Công suất lớn",
          tags: ["bơm", "chính", "nước thải"],
          isOnline: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          _id: new ObjectId(),
          deviceid: "PMP002",
          deviceName: "Bơm Phụ 2",
          deviceType: "bơm",
          location: "Khu Xử Lý A - Tầng 1",
          coordinates: { x: 180, y: 250 },
          samplingCycle: 30,
          status: "active",
          displaygroupid: "GROUP001",
          manufacturer: "KSB",
          model: "Etanorm",
          installationDate: new Date("2023-02-20"),
          lastMaintenance: new Date("2023-11-15"),
          nextMaintenance: new Date("2024-05-15"),
          powerRating: 15,
          voltage: 380,
          currentRating: 28,
          description: "Bơm dự phòng",
          tags: ["bơm", "phụ"],
          isOnline: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          _id: new ObjectId(),
          deviceid: "VAL001",
          deviceName: "Van Điều Khiển 1",
          deviceType: "van",
          location: "Khu Xử Lý A - Tầng 2",
          coordinates: { x: 220, y: 320 },
          samplingCycle: 60,
          status: "active",
          displaygroupid: "GROUP001",
          manufacturer: "Siemens",
          model: "Sipart PS2",
          installationDate: new Date("2023-03-10"),
          lastMaintenance: new Date("2023-10-30"),
          nextMaintenance: new Date("2024-04-30"),
          description: "Van điều khiển điện từ",
          tags: ["van", "điều khiển"],
          isOnline: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },

        // GROUP002 - Trạm Biến Áp Chính
        {
          _id: new ObjectId(),
          deviceid: "TRF001",
          deviceName: "Máy Biến Áp 1",
          deviceType: "trạm",
          location: "Trạm Biến Áp Chính",
          coordinates: { x: 400, y: 200 },
          samplingCycle: 10,
          status: "active",
          displaygroupid: "GROUP002",
          manufacturer: "ABB",
          model: "TXpert",
          installationDate: new Date("2022-11-05"),
          lastMaintenance: new Date("2023-12-10"),
          nextMaintenance: new Date("2024-06-10"),
          powerRating: 1000, // kVA
          voltage: 22000, // V primary
          description: "Máy biến áp chính 22kV/0.4kV",
          tags: ["biến áp", "chính"],
          isOnline: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          _id: new ObjectId(),
          deviceid: "CB001",
          deviceName: "Máy Cắt 1",
          deviceType: "máy cắt",
          location: "Trạm Biến Áp - Tủ điện",
          coordinates: { x: 420, y: 180 },
          samplingCycle: 10,
          status: "active",
          displaygroupid: "GROUP002",
          manufacturer: "Schneider",
          model: "Masterpact",
          installationDate: new Date("2022-11-05"),
          lastMaintenance: new Date("2023-12-10"),
          nextMaintenance: new Date("2024-06-10"),
          currentRating: 1600, // A
          description: "Máy cắt không khí 1600A",
          tags: ["máy cắt", "bảo vệ"],
          isOnline: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },

        // GROUP003 - Hệ Thống Điều Khiển PLC
        {
          _id: new ObjectId(),
          deviceid: "PLC001",
          deviceName: "PLC Điều Khiển Trung Tâm",
          deviceType: "plc",
          location: "Phòng Điều Khiển",
          coordinates: { x: 300, y: 350 },
          samplingCycle: 5,
          status: "active",
          displaygroupid: "GROUP003",
          manufacturer: "Siemens",
          model: "S7-1500",
          installationDate: new Date("2023-05-15"),
          lastMaintenance: new Date("2023-12-20"),
          nextMaintenance: new Date("2024-06-20"),
          description: "PLC điều khiển chính toàn nhà máy",
          tags: ["plc", "điều khiển"],
          isOnline: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          _id: new ObjectId(),
          deviceid: "HMI001",
          deviceName: "Màn Hình HMI 1",
          deviceType: "hmi",
          location: "Phòng Điều Khiển",
          coordinates: { x: 280, y: 320 },
          samplingCycle: 5,
          status: "active",
          displaygroupid: "GROUP003",
          manufacturer: "Siemens",
          model: "TP1200",
          installationDate: new Date("2023-05-15"),
          lastMaintenance: new Date("2023-12-20"),
          nextMaintenance: new Date("2024-06-20"),
          description: "Màn hình giao diện người máy",
          tags: ["hmi", "giao diện"],
          isOnline: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },

        // GROUP004 - Khu Vực Sản Xuất
        {
          _id: new ObjectId(),
          deviceid: "MCH001",
          deviceName: "Máy Ép Thủy Lực",
          deviceType: "máy sản xuất",
          location: "Phân Xưởng Sản Xuất 1",
          coordinates: { x: 500, y: 300 },
          samplingCycle: 60,
          status: "active",
          displaygroupid: "GROUP004",
          manufacturer: "Bosch Rexroth",
          model: "CytroBox",
          installationDate: new Date("2023-07-22"),
          lastMaintenance: new Date("2024-01-10"),
          nextMaintenance: new Date("2024-07-10"),
          powerRating: 45,
          description: "Máy ép thủy lực 100 tấn",
          tags: ["máy ép", "sản xuất"],
          isOnline: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },

        // GROUP005 - Hệ Thống Chiếu Sáng
        {
          _id: new ObjectId(),
          deviceid: "LGT001",
          deviceName: "Hệ Thống Chiếu Sáng Chính",
          deviceType: "chiếu sáng",
          location: "Toàn Nhà Máy",
          coordinates: { x: 350, y: 400 },
          samplingCycle: 300,
          status: "active",
          displaygroupid: "GROUP005",
          manufacturer: "Philips",
          model: "Smart Lighting",
          installationDate: new Date("2023-09-05"),
          lastMaintenance: new Date("2024-01-15"),
          nextMaintenance: new Date("2024-07-15"),
          powerRating: 25,
          description: "Hệ thống chiếu sáng thông minh",
          tags: ["chiếu sáng", "led"],
          isOnline: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      await db.collection("devices").insertMany(devices);
      console.log(`✅ Created ${devices.length} sample devices`);

      // Tạo collections energy_data cho mỗi device
      for (const device of devices) {
        const collectionName = `energy_data_${device.deviceid}`;
        if (!collectionNames.includes(collectionName)) {
          await db.createCollection(collectionName);

          // Tạo index cho collection energy_data
          await db.collection(collectionName).createIndex({ timestamp: -1 });
          await db.collection(collectionName).createIndex({ deviceId: 1 });

          console.log(
            `✅ Created energy_data collection for device ${device.deviceid}`,
          );

          // Thêm dữ liệu mẫu vào energy_data
          await generateSampleEnergyData(db, device);
        }
      }
    } else {
      console.log(
        `📊 Devices collection already has ${devicesCount} documents`,
      );
    }

    // ==================== TẠO ALERTS MẪU ====================
    console.log("\n🚨 Creating sample alerts...");

    const alertsCount = await db.collection("alerts").countDocuments();
    if (alertsCount === 0) {
      // Lấy device IDs để tạo alerts
      const devices = await db.collection("devices").find().limit(5).toArray();

      const alerts = [
        // Alert đang hoạt động (unresolved)
        {
          _id: new ObjectId(),
          deviceId: devices[0]._id,
          deviceName: devices[0].deviceName,
          deviceid: devices[0].deviceid,
          alertType: "warning",
          message: "Dòng điện pha 1 vượt ngưỡng 45A",
          details: {
            currentI1: 48.5,
            threshold: 45,
            phase: "Phase 1",
            location: devices[0].location,
          },
          severity: "orange",
          timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 giờ trước
          resolved: false,
          resolvedAt: null,
          acknowledgedBy: null,
          acknowledgedAt: null,
          priority: "medium",
          category: "electrical",
          source: "automated_monitoring",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          _id: new ObjectId(),
          deviceId: devices[1]._id,
          deviceName: devices[1].deviceName,
          deviceid: devices[1].deviceid,
          alertType: "error",
          message: "Mất kết nối với thiết bị",
          details: {
            lastCommunication: new Date(Date.now() - 30 * 60 * 1000),
            retryCount: 5,
            connectionType: "Ethernet",
          },
          severity: "red",
          timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000), // 4 giờ trước
          resolved: false,
          resolvedAt: null,
          acknowledgedBy: "engineer1",
          acknowledgedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
          priority: "high",
          category: "communication",
          source: "system_monitor",
          createdAt: new Date(),
          updatedAt: new Date(),
        },

        // Alert đã resolved
        {
          _id: new ObjectId(),
          deviceId: devices[2]._id,
          deviceName: devices[2].deviceName,
          deviceid: devices[2].deviceid,
          alertType: "warning",
          message: "Nhiệt độ động cơ cao bất thường",
          details: {
            temperature: 85,
            threshold: 75,
            ambientTemp: 28,
            coolingSystem: "air",
          },
          severity: "orange",
          timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 ngày trước
          resolved: true,
          resolvedAt: new Date(Date.now() - 20 * 60 * 60 * 1000),
          resolvedBy: "engineer1",
          resolutionNotes: "Vệ sinh bộ phận tản nhiệt và kiểm tra quạt làm mát",
          acknowledgedBy: "supervisor1",
          acknowledgedAt: new Date(Date.now() - 23 * 60 * 60 * 1000),
          priority: "medium",
          category: "temperature",
          source: "sensor",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          _id: new ObjectId(),
          deviceId: devices[3]._id,
          deviceName: devices[3].deviceName,
          deviceid: devices[3].deviceid,
          alertType: "normal",
          message: "Thiết bị hoạt động bình thường sau bảo trì",
          details: {
            maintenanceType: "preventive",
            maintenanceDate: new Date(Date.now() - 1 * 60 * 60 * 1000),
            technician: "Nguyễn Văn Kỹ Thuật",
          },
          severity: "green",
          timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1 giờ trước
          resolved: true,
          resolvedAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
          resolvedBy: "engineer1",
          resolutionNotes: "Hoàn thành bảo trì định kỳ",
          acknowledgedBy: "operator1",
          acknowledgedAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
          priority: "low",
          category: "maintenance",
          source: "manual_entry",
          createdAt: new Date(),
          updatedAt: new Date(),
        },

        // Alert cũ hơn
        {
          _id: new ObjectId(),
          deviceId: devices[4]._id,
          deviceName: devices[4].deviceName,
          deviceid: devices[4].deviceid,
          alertType: "warning",
          message: "Điện áp pha 2 thấp hơn ngưỡng",
          details: {
            voltageV2N: 210,
            threshold: 215,
            phase: "Phase 2",
            duration: "15 minutes",
          },
          severity: "orange",
          timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 ngày trước
          resolved: true,
          resolvedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
          resolvedBy: "engineer1",
          resolutionNotes: "Điều chỉnh lại biến áp và kiểm tra nguồn cấp",
          acknowledgedBy: "supervisor1",
          acknowledgedAt: new Date(Date.now() - 2.5 * 24 * 60 * 60 * 1000),
          priority: "medium",
          category: "voltage",
          source: "power_monitor",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      await db.collection("alerts").insertMany(alerts);
      console.log(`✅ Created ${alerts.length} sample alerts`);
    } else {
      console.log(`📊 Alerts collection already has ${alertsCount} documents`);
    }

    // ==================== TẠO API LOGS MẪU ====================
    console.log("\n📝 Creating sample API logs...");

    const apiLogsCount = await db.collection("api_logs").countDocuments();
    if (apiLogsCount === 0 && process.env.NODE_ENV === "development") {
      const users = await db.collection("users").find().toArray();
      const adminUser = users.find((u) => u.username === "admin");

      const apiLogs = [
        {
          _id: new ObjectId(),
          endpoint: "/api/auth/login",
          method: "POST",
          statusCode: 200,
          requestBody: { username: "admin", password: "***REDACTED***" },
          responseBody: {
            success: true,
            message: "Login successful",
            token: "jwt_token_here",
          },
          timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000),
          client: "PostmanRuntime/7.36.3",
          userId: adminUser._id,
          username: "admin",
          processingTime: 125,
          ipAddress: "192.168.1.100",
        },
        {
          _id: new ObjectId(),
          endpoint: "/api/devices",
          method: "GET",
          statusCode: 200,
          requestBody: {},
          responseBody: { success: true, data: [], count: 0 },
          timestamp: new Date(Date.now() - 55 * 60 * 1000),
          client:
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          userId: adminUser._id,
          username: "admin",
          processingTime: 85,
          ipAddress: "192.168.1.101",
        },
        {
          _id: new ObjectId(),
          endpoint: "/api/devices/PMP001",
          method: "GET",
          statusCode: 200,
          requestBody: {},
          responseBody: {
            success: true,
            data: { deviceid: "PMP001", deviceName: "Bơm Chính 1" },
          },
          timestamp: new Date(Date.now() - 50 * 60 * 1000),
          client:
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          userId: adminUser._id,
          username: "admin",
          processingTime: 45,
          ipAddress: "192.168.1.101",
        },
        {
          _id: new ObjectId(),
          endpoint: "/api/health",
          method: "GET",
          statusCode: 200,
          requestBody: {},
          responseBody: { status: "ok", timestamp: new Date() },
          timestamp: new Date(Date.now() - 45 * 60 * 1000),
          client: "curl/7.81.0",
          userId: null,
          username: null,
          processingTime: 12,
          ipAddress: "127.0.0.1",
        },
        {
          _id: new ObjectId(),
          endpoint: "/api/nonexistent",
          method: "GET",
          statusCode: 404,
          requestBody: {},
          responseBody: { error: "Not Found" },
          timestamp: new Date(Date.now() - 40 * 60 * 1000),
          client: "PostmanRuntime/7.36.3",
          userId: null,
          username: null,
          processingTime: 8,
          ipAddress: "192.168.1.150",
        },
      ];

      await db.collection("api_logs").insertMany(apiLogs);
      console.log(`✅ Created ${apiLogs.length} sample API logs`);
    } else {
      console.log(
        `📊 API logs collection already has ${apiLogsCount} documents`,
      );
    }

    // ==================== SUMMARY ====================
    console.log("\n" + "=".repeat(50));
    console.log("✅ DATABASE INITIALIZATION COMPLETE!");
    console.log("=".repeat(50));

    // Hiển thị thống kê
    const stats = {
      users: await db.collection("users").countDocuments(),
      displayGroups: await db.collection("displaygroup").countDocuments(),
      userGroups: await db.collection("user_group").countDocuments(),
      devices: await db.collection("devices").countDocuments(),
      alerts: await db.collection("alerts").countDocuments(),
      apiLogs: await db.collection("api_logs").countDocuments(),
    };

    console.log("\n📊 Database Statistics:");
    console.log(`👤 Users: ${stats.users}`);
    console.log(`🏷️  Display Groups: ${stats.displayGroups}`);
    console.log(`👥 User-Group Relationships: ${stats.userGroups}`);
    console.log(`🔧 Devices: ${stats.devices}`);
    console.log(`🚨 Alerts: ${stats.alerts}`);
    console.log(`📝 API Logs: ${stats.apiLogs}`);

    console.log("\n🔑 Default Login Credentials:");
    console.log("   👑 Admin:       admin / admin123");
    console.log("   🔧 Engineer:    engineer1 / engineer123");
    console.log("   👔 Supervisor:  supervisor1 / supervisor123");
    console.log("   ⚙️  Operator:    operator1 / operator123");
    console.log("   👁️  Viewer:      viewer1 / viewer123");

    console.log("\n🚀 Start the server with:");
    console.log("   npm run dev     (for development)");
    console.log("   npm start       (for production)");

    console.log("\n🌐 API Endpoints:");
    console.log("   📍 Health Check:  http://localhost:3000/api/health");
    console.log("   📍 API Docs:      http://localhost:3000/api");
    console.log(
      "   📍 Login:         POST http://localhost:3000/api/auth/login",
    );

    console.log("\n💾 Database Info:");
    console.log(`   📂 Database: ${db.databaseName}`);
    console.log(`   🔗 Connection: ${uri}`);
  } catch (error) {
    console.error("\n❌ Database initialization failed:", error);
    process.exit(1);
  } finally {
    await client.close();
    console.log("\n🔌 Database connection closed");
  }
}

// Hàm tạo dữ liệu năng lượng mẫu
async function generateSampleEnergyData(db, device) {
  try {
    const collectionName = `energy_data_${device.deviceid}`;
    const collection = db.collection(collectionName);

    const dataCount = await collection.countDocuments();
    if (dataCount > 0) {
      console.log(
        `📊 Device ${device.deviceid} already has ${dataCount} energy data records`,
      );
      return;
    }

    console.log(`⚡ Generating sample energy data for ${device.deviceid}...`);

    const energyData = [];
    const now = new Date();

    // Tạo dữ liệu cho 24 giờ qua (mỗi 5 phút)
    for (let i = 288; i >= 0; i--) {
      // 288 = 24h * 12 (mỗi 5 phút)
      const timestamp = new Date(now.getTime() - i * 5 * 60 * 1000);

      // Tạo giá trị ngẫu nhiên phù hợp với loại thiết bị
      let currentI1,
        currentI2,
        currentI3,
        voltageV1N,
        voltageV2N,
        voltageV3N,
        power,
        netpower;

      if (device.deviceType === "bơm") {
        // Bơm có dòng điện cao hơn
        currentI1 = 35 + Math.random() * 10;
        currentI2 = 35 + Math.random() * 10;
        currentI3 = 35 + Math.random() * 10;
        voltageV1N = 220 + Math.random() * 10;
        voltageV2N = 220 + Math.random() * 10;
        voltageV3N = 220 + Math.random() * 10;
        power = 18 + Math.random() * 5;
        netpower = power * 0.0833; // kWh cho 5 phút
      } else if (device.deviceType === "trạm") {
        // Trạm biến áp có điện áp cao
        currentI1 = 800 + Math.random() * 200;
        currentI2 = 800 + Math.random() * 200;
        currentI3 = 800 + Math.random() * 200;
        voltageV1N = 22000 + Math.random() * 1000;
        voltageV2N = 22000 + Math.random() * 1000;
        voltageV3N = 22000 + Math.random() * 1000;
        power = 800 + Math.random() * 200;
        netpower = power * 0.0833;
      } else {
        // Thiết bị khác
        currentI1 = 10 + Math.random() * 20;
        currentI2 = 10 + Math.random() * 20;
        currentI3 = 10 + Math.random() * 20;
        voltageV1N = 220 + Math.random() * 10;
        voltageV2N = 220 + Math.random() * 10;
        voltageV3N = 220 + Math.random() * 10;
        power = 5 + Math.random() * 15;
        netpower = power * 0.0833;
      }

      // Tính điện áp dây
      const voltageV12 = Math.sqrt(3) * voltageV1N;
      const voltageV23 = Math.sqrt(3) * voltageV2N;
      const voltageV31 = Math.sqrt(3) * voltageV3N;

      energyData.push({
        deviceId: device._id,
        timestamp,
        currentI1: parseFloat(currentI1.toFixed(2)),
        currentI2: parseFloat(currentI2.toFixed(2)),
        currentI3: parseFloat(currentI3.toFixed(2)),
        voltageV1N: parseFloat(voltageV1N.toFixed(2)),
        voltageV2N: parseFloat(voltageV2N.toFixed(2)),
        voltageV3N: parseFloat(voltageV3N.toFixed(2)),
        voltageV12: parseFloat(voltageV12.toFixed(2)),
        voltageV23: parseFloat(voltageV23.toFixed(2)),
        voltageV31: parseFloat(voltageV31.toFixed(2)),
        power: parseFloat(power.toFixed(2)),
        netpower: parseFloat(netpower.toFixed(4)),
      });
    }

    // Chèn dữ liệu theo từng batch để tránh timeout
    const batchSize = 100;
    for (let i = 0; i < energyData.length; i += batchSize) {
      const batch = energyData.slice(i, i + batchSize);
      await collection.insertMany(batch);
    }

    console.log(
      `✅ Generated ${energyData.length} energy data records for ${device.deviceid}`,
    );
  } catch (error) {
    console.error(
      `❌ Error generating energy data for ${device.deviceid}:`,
      error.message,
    );
  }
}

// Xử lý khi người dùng nhấn Ctrl+C
process.on("SIGINT", async () => {
  console.log("\n\n👋 Exiting database initialization...");
  await client.close();
  process.exit(0);
});

// Chạy initialization
initDatabase().catch(console.error);
