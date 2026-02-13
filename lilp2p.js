//dependencies:
//https://supertestnet.github.io/bankify/super_nostr.js
//https://bundle.run/noble-secp256k1@1.2.14
var lilP2P = {
    connection_id: null,
    connection_point: null,
    nostr_relays: [ `wss://relay.notoshi.win/` ],
    cfg: { iceServers: [ { urls: [ `stun:stun.gmx.net` ] } ] },
    con: { optional: [ { DtlsSrtpKeyAgreement: true } ] },
    sdpConstraints: { optional: [] },
    chats: {},
    messages: [],
    privkey: null,
    users: {},
    waitSomeTime: num => new Promise( resolve => setTimeout( resolve, num ) ),
    textToHex: text => {
        var encoded = new TextEncoder().encode( text );
        return Array.from( encoded )
            .map( x => x.toString( 16 ).padStart( 2, "0" ) )
            .join( "" );
    },
    hexToText: hex => {
        var bytes = new Uint8Array( Math.ceil( hex.length / 2 ) );
        var i; for ( i=0; i<hex.length; i++ ) bytes[ i ] = parseInt( hex.substr( i * 2, 2 ), 16 );
        var text = new TextDecoder().decode( bytes );
        return text;
    },
    init: chat_id => {
        if ( !chat_id ) chat_id = "c_" + super_nostr.getPrivkey().substring( 0, 16 );
        lilP2P.chats[ chat_id ] = {
            messages: [],
            ready: false,
            localOffer: null,
            remoteOffer: null,
            remoteAnswer: null,
            activedc: null,
            dc1: null,
            dc2: null,
            tn1: null,
            pc1: null,
            pc2: null,
        }
        return chat_id;
    },
    updateOnIce1: ( e, chat_id ) => {
        if ( e.candidate ) return;
        lilP2P.chats[ chat_id ].localOffer = lilP2P.chats[ chat_id ].pc1.localDescription;
    },
    updateOnIce2: async ( e, chat_id ) => {
        if ( e.candidate ) return;
        var [ connection_pubkey, nostr_relay ] = lilP2P.connection_point.split( "," );
        var privkey = lilP2P.nostr_privkey;
        var msg = JSON.stringify( lilP2P.chats[ chat_id ].pc2.localDescription );
        var emsg = await super_nostr.alt_encrypt( privkey, connection_pubkey, msg );
        var event = await super_nostr.prepEvent( privkey, emsg, 4, [ [ "p", connection_pubkey ] ] );
        await super_nostr.alt_sendEvent( event, nostr_relay );
        lilP2P.chats[ chat_id ].ready = true;
    },
    makeOffer: chat_id => {
        lilP2P.chats[ chat_id ].dc1 = lilP2P.chats[ chat_id ].pc1.createDataChannel( 'test', { reliable: true });
        lilP2P.chats[ chat_id ].activedc = lilP2P.chats[ chat_id ].dc1;
        lilP2P.chats[ chat_id ].dc1.onopen = e => {};
        lilP2P.chats[ chat_id ].dc1.onmessage = e => {
            if ( e.data.size ) {
                fileReceiver1.receive( e.data, {} );
            } else {
                if ( e.data.charCodeAt( 0 ) === 2 ) return;
                var data = JSON.parse(e.data)
                if (data.type === 'file') {
                    fileReceiver1.receive( e.data, {} );
                } else {
                    lilP2P.chats[ chat_id ].messages.push( [ data.message, Date.now() ] );
                }
            }
        }
        lilP2P.chats[ chat_id ].pc1.createOffer(
            desc => lilP2P.chats[ chat_id ].pc1.setLocalDescription( desc, () => {}, () => {} ),
            () => {},
            lilP2P.sdpConstraints,
        );
    },
    prepareToReceiveData: ( e, chat_id ) => {
        var datachannel = e.channel || e;
        lilP2P.chats[ chat_id ].dc2 = datachannel;
        lilP2P.chats[ chat_id ].activedc = lilP2P.chats[ chat_id ].dc2;
        lilP2P.chats[ chat_id ].dc2.onopen = e => {};
        lilP2P.chats[ chat_id ].dc2.onmessage = e => {
            if ( e.data.size ) {
                fileReceiver2.receive( e.data, {} );
            } else {
                var data = JSON.parse( e.data )
                if (data.type === 'file') {
                  fileReceiver2.receive( e.data, {} );
                } else {
                    lilP2P.chats[ chat_id ].messages.push( [ data.message, Date.now() ] );
                }
            }
        }
    },
    acceptOffer: chat_id => {
        var offer = lilP2P.chats[ chat_id ].remoteOffer;
        var offerDesc = new RTCSessionDescription( JSON.parse( offer ) );
        lilP2P.chats[ chat_id ].pc2.setRemoteDescription( offerDesc );
        lilP2P.chats[ chat_id ].pc2.createAnswer(
            answerDesc => lilP2P.chats[ chat_id ].pc2.setLocalDescription( answerDesc ),
            () => {},
            lilP2P.sdpConstraints,
        );
    },
    getConnectionPoint: () => {
        var nostr_relay = lilP2P.nostr_relays[ 0 ];
        var pubkey = super_nostr.getPubkey( lilP2P.nostr_privkey );
        return `${pubkey},${nostr_relay}`;
    },
    prepareAdminConnection: async () => {
        lilP2P.nostr_privkey = super_nostr.getPrivkey();
        var am_admin = true;
        lilP2P.connection_id = await lilP2P.setUpComms( lilP2P.nostr_privkey, am_admin );
        return lilP2P.getConnectionPoint();
    },
    prepareUserConnection: async connection_point => {
        //set up nostr listener
        var [ admin, nostr_relay ] = connection_point.split( "," );
        lilP2P.nostr_relays = [ nostr_relay ];
        lilP2P.nostr_privkey = super_nostr.getPrivkey();
        var pubkey = super_nostr.getPubkey( lilP2P.nostr_privkey );
        var am_admin = false;
        lilP2P.connection_id = await lilP2P.setUpComms( lilP2P.nostr_privkey, am_admin, admin );

        //request offer
        var msg = JSON.stringify({msg_type: "ctn_request", msg_value: ""});
        var emsg = await super_nostr.alt_encrypt( lilP2P.nostr_privkey, admin, msg );
        var event = await super_nostr.prepEvent( lilP2P.nostr_privkey, emsg, 4, [ [ "p", admin ] ] );
        var socket = super_nostr.sockets[ lilP2P.connection_id ].socket;
        super_nostr.sendEvent( event, socket );

        //wait til connection is established
        var loop = async () => {
            if ( lilP2P.users.hasOwnProperty( pubkey ) ) return;
            await lilP2P.waitSomeTime( 10 );
            return loop();
        }
        await loop();

        //close nostr socket
        super_nostr.sockets[ lilP2P.connection_id ].socket.close();
        lilP2P.connection_id = null;

        //return chat_id
        var chat_id = lilP2P.users[ pubkey ];
        delete lilP2P.users[ pubkey ];
        return chat_id;
    },
    send: ( chat_id, message ) => {
        lilP2P.chats[ chat_id ].activedc.send( JSON.stringify({ message }) );
        lilP2P.chats[ chat_id ].messages.push([ message, Date.now() ]);
        return true;
    },
    setUpComms: async ( privkey, am_admin, admin ) => {
        var pubkey = super_nostr.getPubkey( privkey );
        var listenFunction = async socket => {
            var subId = super_nostr.bytesToHex( crypto.getRandomValues( new Uint8Array( 8 ) ) );
            var filter  = {}
            filter.kinds = [ 4 ];
            filter.since = Math.floor( Date.now() / 1000 );
            filter[ "#p" ] = [ pubkey ];
            var subscription = [ "REQ", subId, filter ];
            socket.send( JSON.stringify( subscription ) );
        }
        if ( am_admin ) {
            var handleFunction = async message => {
                var [ type, subId, event ] = JSON.parse( message.data );
                if ( !event || event === true ) return;
                var privkey = lilP2P.nostr_privkey;
                event.content = await super_nostr.alt_decrypt( privkey, event.pubkey, event.content );
                var json = JSON.parse( event.content );
                if ( json.msg_type === "ctn_request" ) {
                    //prepare pc1
                    var chat_id = lilP2P.init();
                    lilP2P.users[ event.pubkey ] = chat_id;
                    lilP2P.chats[ chat_id ].pc1 = new RTCPeerConnection( lilP2P.cfg, lilP2P.con );
                    lilP2P.connection_point = lilP2P.getConnectionPoint();
                    lilP2P.chats[ chat_id ].pc1.onicecandidate = e => {lilP2P.updateOnIce1( e, chat_id )};
                    lilP2P.makeOffer( chat_id );

                    //wait for offer
                    var loop = async () => {
                        if ( lilP2P.chats[ chat_id ].localOffer ) return;
                        await lilP2P.waitSomeTime( 10 );
                        return loop();
                    }
                    await loop();

                    //tell user about offer
                    var emsg = await super_nostr.alt_encrypt( privkey, event.pubkey, JSON.stringify( [ lilP2P.chats[ chat_id ].localOffer, lilP2P.connection_point, chat_id ] ) );
                    var event = await super_nostr.prepEvent( privkey, emsg, 4, [ [ "p", event.pubkey ] ] );
                    var socket = super_nostr.sockets[ lilP2P.connection_id ].socket;
                    super_nostr.sendEvent( event, socket );
                } else {
                    var chat_id = lilP2P.users[ event.pubkey ];
                    if ( !chat_id ) return;
                    lilP2PInterface.chatLoop( chat_id, 0 );
                    var answer = event.content;
                    lilP2P.chats[ chat_id ].remoteAnswer = answer;
                    var answerDesc = new RTCSessionDescription( JSON.parse( answer ) );
                    lilP2P.chats[ chat_id ].pc1.setRemoteDescription( answerDesc );
                    lilP2P.chats[ chat_id ].ready = true;
                }
            }
        } else {
            var handleFunction = async message => {
                var [ type, subId, event ] = JSON.parse( message.data );
                if ( !event || event === true ) return;
                event.content = await super_nostr.alt_decrypt( privkey, event.pubkey, event.content );
                if ( event.pubkey !== admin ) return;

                //prepare pc2
                var [ remote_offer, connection_point, chat_id ] = JSON.parse( event.content );
                lilP2P.users[ pubkey ] = chat_id;
                lilP2P.init( chat_id );
                lilP2PInterface.chatLoop( chat_id, 0 );
                lilP2P.chats[ chat_id ].remoteOffer = JSON.stringify( remote_offer );
                lilP2P.connection_point = connection_point;
                lilP2P.chats[ chat_id ].pc2 = new RTCPeerConnection( lilP2P.cfg, lilP2P.con );
                lilP2P.chats[ chat_id ].pc2.ondatachannel = e => {lilP2P.prepareToReceiveData( e, chat_id )};
                lilP2P.chats[ chat_id ].pc2.onicecandidate = e => {lilP2P.updateOnIce2( e, chat_id )};

                //accept offer
                lilP2P.acceptOffer( chat_id );
            }
        }
        var nostr_relay = lilP2P.nostr_relays[ 0 ];
        var connection_id = await super_nostr.newPermanentConnection( nostr_relay, listenFunction, handleFunction );
        var loop = async () => {
            var socket = super_nostr.sockets[ connection_id ].socket;
            if ( socket.readyState === 1 ) return;
            await lilP2P.waitSomeTime( 1 );
            return loop();
        }
        await loop();
        return connection_id;
    },
}
