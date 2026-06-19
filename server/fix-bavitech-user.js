require('dotenv').config();
const { MongoClient } = require('mongodb');

(async () => {
    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    const db = client.db(process.env.DATABASE_NAME);
    const users = db.collection('users');

    const doc = await users.findOne({ username: 'Bavitech' });
    console.log('found:', doc ? { username: doc.username, loraUsername: doc.loraUsername } : null);

    if (doc && !doc.loraUsername) {
        const r = await users.updateOne({ _id: doc._id }, { $set: { loraUsername: 'Bavitech' } });
        console.log('updated:', r.modifiedCount);
    } else if (!doc) {
        console.log('user "Bavitech" not found — check exact username/case in DB');
    } else {
        console.log('loraUsername already set:', doc.loraUsername);
    }

    await client.close();
})();
