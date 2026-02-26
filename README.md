# lilp2p
A library for doing p2p stuff via webrtc with nostr as a signaling mechanism

# API

Open a page containing lilp2p.js and run this:

```
var connection_point = await lilP2P.prepareAdminConnection();
```

Open another page containing lilp2p.js and run this:

```
var chat_id = await lilP2P.prepareUserConnection( connection_point );
```

The chat_id from the previous step should become visible to the admin as a new key/value pair in an object at lilP2P.chats – now either party can send messages to the other via this command:

```
var success = lilP2P.send( chat_id, "any text string" );
```

Either party can view the chatlog like this:

```
var chatlog = lilP2P.chats[ chat_id ].messages;
console.log( chatlog );
```
