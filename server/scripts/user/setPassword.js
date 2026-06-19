const monk = require('monk');
const bcrypt = require('bcrypt');

const mongoUrl = process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/ashteki';

const username = process.argv[2];
const newPassword = process.argv[3];

if (!username || !newPassword) {
    console.error('Usage: node server/scripts/user/setPassword.js <username> <newPassword>');
    process.exit(1);
}

console.log('attached to: ' + mongoUrl);

const db = monk(mongoUrl);
const collection = db.get('users');

(async () => {
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const result = await collection.update({ username: username }, { $set: { password: passwordHash } });
    console.log(`updated user '${username}':`, result);
    await db.close();
})().catch((err) => {
    console.error(err);
    db.close();
    process.exit(1);
});
