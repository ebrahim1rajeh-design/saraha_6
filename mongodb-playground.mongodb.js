// MongoDB for VS Code Playground
// Open this file in VS Code and click "Run All" (or press Ctrl+Alt+R) after connecting to mongodb://127.0.0.1:27017

use('saraha_db');

// View all registered users (without passwords)
db.getCollection('users').find({}, { password: 0 });

// View anonymous messages
db.getCollection('messages').find({});

// View identity reveal requests
db.getCollection('identityrequests').find({});

// View conversations
db.getCollection('conversations').find({});

// View conversation messages
db.getCollection('conversationmessages').find({});
