const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

/**
 * Cleanup Ghost Accounts
 * Runs every day at midnight.
 * Hunts down users who are NOT verified AND signed up more than 24 hours ago.
 * Securely deletes them from Firebase Authentication list to keep it clean from spam.
 */
exports.cleanupGhosts = functions.pubsub.schedule("every 24 hours").onRun(async (context) => {
    let deletedCount = 0;
    let nextPageToken;
    const now = Date.now();
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;

    console.log("Starting Ghost Account Cleanup Routine...");

    do {
        // Fetch users in batches of 1000
        const result = await admin.auth().listUsers(1000, nextPageToken);
        nextPageToken = result.pageToken;

        const usersToDelete = [];

        result.users.forEach((userRecord) => {
            // Check if they are NOT verified
            if (!userRecord.emailVerified) {
                // Check if the account is older than 24 hours
                const createdAt = new Date(userRecord.metadata.creationTime).getTime();
                if ((now - createdAt) > ONE_DAY_MS) {
                    usersToDelete.push(userRecord.uid);
                }
            }
        });

        // Batch delete the unverified users found in this page
        if (usersToDelete.length > 0) {
            await admin.auth().deleteUsers(usersToDelete);
            console.log(`Deleted batch of ${usersToDelete.length} unverified users.`);
            deletedCount += usersToDelete.length;
        }

    } while (nextPageToken);

    console.log(`Routine Complete. Successfully purged ${deletedCount} unverified ghost accounts.`);
    return null;
});
