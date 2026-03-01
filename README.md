# lilp2p
A library for doing p2p stuff via webrtc with nostr as a signaling mechanism

# API

The first user prepares to receive messages like this:

```
var connection_point = await lilP2P.prepareAdminConnection();
```

The second user connects to the first user like this:

```
var chat_id = await lilP2P.prepareUserConnection( connection_point );
```

The chat_id from the previous step should become visible to the first user as a new key/value pair in an object at lilP2P.chats – now either user can send messages to the other user via this command:

```
var success = lilP2P.send( chat_id, "any text string" );
```

Either party can view the chatlog like this:

```
var chatlog = lilP2P.chats[ chat_id ].messages;
console.log( chatlog );
```

The structure of messages in the chatlog is:

```
{ text: <text of the message>, timestamp: <unix timestamp>, from: <string "me" or "them"> }
```
