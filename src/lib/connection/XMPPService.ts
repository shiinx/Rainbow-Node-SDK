"use strict";

import * as util from "util";
import {makeId} from "../common/Utils";
import {setTimeoutPromised} from "../common/Utils";
import * as PubSub from "pubsub-js";
import {Conversation} from "../common/models/Conversation";
const packageVersion = require("../../package");

// Until web proxy on websocket solved, patch existing configuration to offer the proxy options
let ws_options = null;

// @ts-ignore
let isInTest = typeof global.it === "function";
let WS;
if ( isInTest ) {
    WS = require("mock-socket").WebSocket; 
} else {
    WS = require("ws");
}

class XmppWebSocket extends WS {
    constructor( address, protocols ) {
        super(address, protocols, ws_options);
    }
} 
// @ts-ignore
global.WebSocket = XmppWebSocket;

const Client = require("../common/XmppQueue/XmppClient").XmppClient;
const xml = require("@xmpp/xml");
let backoff = require("backoff");
//const setTimeout = require("timers").setTimeout;

const HttpsProxyAgent = require("https-proxy-agent");

import {XMPPUTils} from "../common/XMPPUtils";

import {IQEventHandler} from "./XMPPServiceHandler/iqEventHandler";

const LOG_ID = "XMPP - ";

const ONLINE_EVENT = "online";
const OFFLINE_EVENT = "offline";
const CONNECT_EVENT = "connect";
const RECONNECT_EVENT = "reconnect";
const RECONNECTED_EVENT = "reconnected";
const RECONNECTING_EVENT = "reconnecting";
const DISCONNECT_EVENT = "disconnect";
const CLOSE_EVENT = "close";
const END_EVENT = "end";
const ERROR_EVENT = "error";
const STANZA_EVENT = "stanza";
const STATUS_EVENT = "status";
const BIND_EVENT = "bind";
const AUTHENTICATE_EVENT = "authenticate";
const TYPE_CHAT = "chat";
const TYPE_GROUPCHAT = "groupchat";

const RECONNECT_INITIAL_DELAY = 5000;
const RECONNECT_MAX_DELAY = 60000;
const MAX_IDLE_TIMER = 70000;
const MAX_PING_ANSWER_TIMER = 5000;


const NameSpacesLabels = {
    "ChatstatesNS" : "http://jabber.org/protocol/chatstates",
    "ReceiptNS" : "urn:xmpp:receipts",
    "CallLogNamespace" : "jabber:iq:telephony:call_log",
    "CallLogAckNamespace" : "urn:xmpp:telephony:call_log:receipts",
    "CallLogNotificationsNamespace" : "jabber:iq:notification:telephony:call_log",
    "RsmNameSpace" : "http://jabber.org/protocol/rsm",
    "Carbon2NameSpace" : "urn:xmpp:carbons:2",
    "ApplicationNameSpace" : "jabber:iq:application",
    "RosterNameSpace" : "jabber:iq:roster",
    "ClientNameSpace" : "jabber:client",
    "PingNameSpace" : "urn:xmpp:ping",
    "DataNameSpace" : "jabber:x:data",
    "MucNameSpace" : "http://jabber.org/protocol/muc",
    "ReceiptsNameSpace" : "urn:xmpp:receipts",
    "ChatestatesNameSpace" : "http://jabber.org/protocol/chatstates",
    "ContentNameSpace" : "urn:xmpp:content",
    "MessageCorrectNameSpace" : "urn:xmpp:message-correct:0",
    "HintsNameSpace" : "urn:xmpp:hints",
    "OobNameSpace" : "jabber:x:oob",
    "Monitoring1NameSpace" : "urn:xmpp:pbxagent:monitoring:1",
    "CallService1NameSpace" : "urn:xmpp:pbxagent:callservice:1"

};

class XMPPService {
	public serverURL: any;
	public host: any;
	public eventEmitter: any;
	public version: any;
	public jid_im: any;
	public jid_tel: any;
	public jid_password: any;
	public fullJid: any;
	public jid: any;
	public userId: any;
	public initialPresence: any;
	public xmppClient: any;
	public logger: any;
	public proxy: any;
	public shouldSendReadReceipt: any;
	public useXMPP: any;
	public timeBetweenXmppRequests: any;
	public isReconnecting: any;
	public maxAttempts: any;
	public idleTimer: any;
	public pingTimer: any;
	public forceClose: any;
	public applicationId: any;
	public generatedRandomId: any;
	public hash: any;
	public handleXMPPConnection: any;
	public reconnect: any;
	public fibonacciStrategy: any;
	public serverUR: any;
	public IQEventHandlerToken: any;
	public IQEventHandler: any;
	private xmppUtils : XMPPUTils;

    constructor(_xmpp, _im, _application, _eventEmitter, _logger, _proxy) {
        this.serverURL = _xmpp.protocol + "://" + _xmpp.host + ":" + _xmpp.port + "/websocket";
        this.host = _xmpp.host;
        this.eventEmitter = _eventEmitter;
        this.version = "0.1";
        this.jid_im = "";
        this.jid_tel = "";
        this.jid_password = "";
        this.fullJid = "";
        this.jid = "";
        this.userId = "";
        this.initialPresence = true;
        this.xmppClient = null;
        this.logger = _logger;
        this.proxy = _proxy;
        this.shouldSendReadReceipt = _im.sendReadReceipt;
        this.useXMPP = true;
        this.timeBetweenXmppRequests = _xmpp.timeBetweenXmppRequests;
        this.isReconnecting = false;
        this.maxAttempts = 1;
        this.idleTimer = null;
        this.pingTimer = null;
        this.forceClose = false;
        this.applicationId = _application.appID;

        this.xmppUtils = XMPPUTils.getXMPPUtils();

        this.generatedRandomId = this.xmppUtils.generateRandomID();

        this.hash = makeId(8);


        this.handleXMPPConnection = (headers) => {

            let that = this;

            let domain = that.xmppUtils.getDomainFromFullJID(this.fullJid);

            let options = {agent: null};
            Object.assign(options, headers);
            if (this.proxy.isProxyConfigured) {
                // Until web proxy on websocket solved, patch existing configuration to offer the proxy options
                options.agent = new HttpsProxyAgent(this.proxy.proxyURL);
                ws_options = options;
            }

            /*
            this.xmppClient = new Client({
                "jid": this.fullJid,
                "password": this.jid_password,
                "host": this.host,
                "websocket": {
                    "url": this.serverURL + "?x-rainbow-xmpp-dom=" + domain,
                    "options": options
                }
            }); // */

            //"domain": {enter(node) {
            //}, exit(node){}},

            this.xmppClient = new Client({
                "service": this.serverURL + "?x-rainbow-xmpp-dom=" + domain,
                "domain": domain,
             //   "resource": "nodesdk",
                "username": this.fullJid,
                "password": this.jid_password,
                "options": options,
                "mechanism": "PLAIN"
            }); //"domain": domain,
// */

            this.xmppClient.init(this.logger, this.timeBetweenXmppRequests);

            //this.reconnect = this.xmppClient.plugin(require("@xmpp/plugins/reconnect"));
            this.reconnect = this.xmppClient.reconnect;

            this.reconnect.delay = RECONNECT_INITIAL_DELAY;

            this.fibonacciStrategy = new backoff.FibonacciStrategy({
                randomisationFactor: 0.4,
                initialDelay: RECONNECT_INITIAL_DELAY,
                maxDelay: RECONNECT_MAX_DELAY
            });

            //const sasl = this.xmppClient.plugins.sasl;
            /*const sasl = this.xmppClient.sasl;
            sasl.getMechanism = mechs => {
                return "PLAIN"; // Force plain sasl
            }; // */
            this.xmppClient.setgetMechanism((mechs) => {
                return "PLAIN"; // Force plain sasl
            });


            /*
            this.xmppClient.handle(AUTHENTICATE_EVENT, authenticate => {
                return authenticate(this.fullJid, this.jid_password);
            });

            this.xmppClient.handle(BIND_EVENT, (bind) => {
                return bind(that.xmppUtils.getResourceFromFullJID(this.fullJid));
            }); // */

            this.xmppClient.on("input", (packet) => {
                that.logger.log("internal", LOG_ID + "(handleXMPPConnection) ", that.logger.colors.cyan(" raw in - ⮈ stanza : ") + that.logger.colors.cyan(packet));
                that.startOrResetIdleTimer(true);
            });

            this.xmppClient.on("output", (packet) => {
                that.logger.log("internal", LOG_ID + "(handleXMPPConnection) ", that.logger.colors.yellow(" raw out - ⮊ stanza : ") + that.logger.colors.yellow(packet));
                that.startOrResetIdleTimer(false);
            });

            this.xmppClient.on(ONLINE_EVENT, (msg) => {
                that.logger.log("info", LOG_ID + "(handleXMPPConnection) event - ONLINE_EVENT : " + ONLINE_EVENT + " |", msg);
                that.logger.log("info", LOG_ID + "(handleXMPPConnection) connected as " + msg);

                if (!that.isReconnecting) {
                    that.eventEmitter.emit("xmppconnected");
                }
            });

            this.xmppClient.on(STATUS_EVENT, msg => {
                that.logger.log("info", LOG_ID + "(handleXMPPConnection) event - STATUS_EVENT : " + STATUS_EVENT + " |", msg);
                /* if (msg === "closing") {
                     that.xmppClient.restartConnect().then((res) => {
                         that.logger.log("debug", LOG_ID + "(handleXMPPConnection) restartConnect result : ", res);
                     }).catch((err) => {
                         that.logger.log("error", LOG_ID + "(handleXMPPConnection) restartConnect error : ", err);
                     }).then(() => {
                         that.logger.log("debug", LOG_ID + "on STATUS_EVENT ");
                     });
                 } // */
            });

            this.xmppClient.on(STANZA_EVENT, (stanza) => {
                that.logger.log("internal", LOG_ID + "(handleXMPPConnection) event - STANZA_EVENT : " + STANZA_EVENT + " |", stanza.toString());

                let eventId = that.hash + "." + stanza.getNS() + "." + stanza.getName() + (stanza.attrs.type ? "." + stanza.attrs.type : "");
                that.logger.log("debug", LOG_ID + "(handleXMPPConnection) event - STANZA_EVENT : eventId ", eventId);
                let delivered = PubSub.publish(eventId, stanza);

                stanza.children.forEach((child) => {
                    delivered |= PubSub.publish(that.hash + "." + child.getNS() + "." + child.getName() + (child.attrs.type ? "." + child.attrs.type : ""), stanza);
                });

                if (!delivered) {
                    that.logger.log("error", LOG_ID + "(handleXMPPConnection) event - STANZA_EVENT : " + STANZA_EVENT + " not managed |", stanza.getNS() + "." + stanza.getName() + (stanza.attrs.type ? "." + stanza.attrs.type : ""));
                }

                switch (stanza.getName()) {
                    case "iq":
                        // let children = stanza.children;
                        // children.forEach((node) => {
                        //     switch (node.getName()) {
                        //         case "ping":
                        //             let stanzaResponse = xml("iq", {
                        //                 "to": stanza.attrs.from,
                        //                 "id": stanza.attrs.id,
                        //                 "xmlns": stanza.getNS(),
                        //                 "type": "result"
                        //             });
                        //             that.logger.log("info", LOG_ID + "(handleXMPPConnection) answered - 'stanza'", stanzaResponse.toString());
                        //             that.xmppClient.send(stanzaResponse);
                        //             break;
                        //         case "query":
                        //             if (stanza.attrs.type === "result" || stanza.attrs.type === "set") {
                        //                 if (node.attrs.xmlns === NameSpacesLabels.RosterNameSpace) {
                        //                     let contacts = [];
                        //                     let subchildren = node.children;
                        //                     subchildren.forEach(function(item) {
                        //                         if (item.attrs.jid.substr(0, 3) !== "tel") {
                        //                             contacts.push({
                        //                                 jid: item.attrs.jid,
                        //                                 subscription: item.attrs.subscription,
                        //                                 ask: item.attrs.ask || ""
                        //                             });
                        //                         }
                        //                     });
                        //                     that.logger.log("info", LOG_ID + "(handleXMPPConnection) XMPP Rosters received", contacts.length);
                        //                     that.eventEmitter.emit("rainbow_onrosters", contacts);
                        //                 }
                        //             }
                        //             break;
                        //         case "default":
                        //             that.logger.log("warn", LOG_ID + "(handleXMPPConnection) not managed - 'stanza'", node.getName());
                        //             break;
                        //         default:
                        //             that.logger.log("warn", LOG_ID + "(handleXMPPConnection) child not managed for iq - 'stanza'", node.getName());
                        //             break;
                        //     }
                        // });
                        // if (stanza.attrs.type && stanza.attrs.type === "result") {
                        //     if (stanza.attrs.id === "enable_xmpp_carbon") {
                        //         that.eventEmitter.emit("rainbow_oncarbonactivated");
                        //     }
                        // }
                        break;
                    case "message":
                        let content = "";
                        let lang = "";
                        let alternativeContent = [];
                        let subject = "";
                        let event = "";
                        let eventJid = "";
                        let hasATextMessage = false;
                        let oob = null;
                        let messageType = stanza.attrs.type;
                        if (messageType === TYPE_CHAT || messageType === TYPE_GROUPCHAT) {

                            // let fromJid = that.xmppUtils.getBareJIDFromFullJID(stanza.attrs.from);
                            // let resource = that.xmppUtils.getResourceFromFullJID(stanza.attrs.from);
                            // let toJid = stanza.attrs.to;
                            // let id = stanza.attrs.id;
                            // let children = stanza.children;
                            // children.forEach((node) => {
                            //     switch (node.getName()) {
                            //         case "sent":
                            //             if (node.attrs.xmlns === NameSpacesLabels.Carbon2NameSpace) {
                            //                 that.logger.log("info", LOG_ID + "(handleXMPPConnection) message - CC message 'sent' received");
                            //                 let forwarded = node.children[0];
                            //                 if (forwarded && forwarded.getName() === "forwarded") {
                            //                     let message = forwarded.children[0];
                            //                     if (message && message.getName() === "message") {
                            //                         fromJid = that.xmppUtils.getBareJIDFromFullJID(message.attrs.from);
                            //                         resource = that.xmppUtils.getResourceFromFullJID(message.attrs.from);
                            //                         toJid = message.attrs.to;
                            //                         id = message.attrs.id;
                            //                         let childs = message.children;
                            //                         if (childs) {
                            //                             childs.forEach((nodeChild) => {
                            //                                 if (nodeChild.getName() === "body") {
                            //                                     that.logger.log("info", LOG_ID + "(handleXMPPConnection) message - CC message 'sent' of type chat received ");

                            //                                     let data = {
                            //                                         "fromJid": fromJid,
                            //                                         "resource": resource,
                            //                                         "toJid": toJid,
                            //                                         "type": messageType,
                            //                                         "content": nodeChild.getText(),
                            //                                         "id": id,
                            //                                         "lang": nodeChild.attrs["xml:lang"],
                            //                                         "cc": true,
                            //                                         "cctype": "sent",
                            //                                         "isEvent": false
                            //                                     };

                            //                                     that.eventEmitter.emit("rainbow_onmessagereceived", data);

                            //                                 }
                            //                             });
                            //                         }
                            //                     }
                            //                 }
                            //             }
                            //             break;
                            //         case "received":
                            //             if (node.attrs.xmlns === NameSpacesLabels.Carbon2NameSpace) {
                            //                 that.logger.log("info", LOG_ID + "(handleXMPPConnection) message - CC message 'sent' received");
                            //                 let forwarded = node.children[0];
                            //                 if (forwarded && forwarded.getName() === "forwarded") {
                            //                     let message = forwarded.children[0];
                            //                     if (message && message.getName() === "message") {
                            //                         fromJid = that.xmppUtils.getBareJIDFromFullJID(message.attrs.from);
                            //                         resource = that.xmppUtils.getResourceFromFullJID(message.attrs.from);
                            //                         toJid = message.attrs.to;
                            //                         id = message.attrs.id;
                            //                         let childs = message.children;
                            //                         if (childs) {
                            //                             childs.forEach(function (nodeChild) {
                            //                                 if (nodeChild.getName() === "body") {
                            //                                     that.logger.log("info", LOG_ID + "(handleXMPPConnection) message - CC message 'sent' of type chat received ");

                            //                                     let data = {
                            //                                         "fromJid": fromJid,
                            //                                         "resource": resource,
                            //                                         "toJid": toJid,
                            //                                         "type": messageType,
                            //                                         "content": nodeChild.getText(),
                            //                                         "id": id,
                            //                                         "lang": nodeChild.attrs["xml:lang"],
                            //                                         "cc": true,
                            //                                         "cctype": "sent",
                            //                                         "isEvent": false
                            //                                     };

                            //                                     that.eventEmitter.emit("rainbow_onmessagereceived", data);

                            //                                 }
                            //                             });
                            //                         }
                            //                     }
                            //                 }
                            //             }
                            //             else {
                            //                 let receipt = {
                            //                     event: node.attrs.event,
                            //                     entity: node.attrs.entity,
                            //                     type: messageType,
                            //                     id: node.attrs.id,
                            //                     fromJid: fromJid,
                            //                     resource: resource
                            //                 };
                            //                 that.logger.log("info", LOG_ID + "(handleXMPPConnection) message - receipt received");
                            //                 that.eventEmitter.emit("rainbow_onreceipt", receipt);
                            //             }
                            //             break;
                            //         case "active":
                            //             that.logger.log("info", LOG_ID + "(handleXMPPConnection) message - someone is active");
                            //             break;
                            //         case "inactive":
                            //             that.logger.log("info", LOG_ID + "(handleXMPPConnection) message - someone is inactive");
                            //             break;
                            //         case "composing":
                            //             that.logger.log("info", LOG_ID + "(handleXMPPConnection) message - someone is writing");
                            //             break;
                            //         case "archived":
                            //             break;
                            //         case "stanza-id":
                            //             break;
                            //         case "subject":
                            //             subject = node.getText();
                            //             break;
                            //         case "event":
                            //             event = node.attrs.name;
                            //             eventJid = node.attrs.jid;
                            //             break;
                            //         case "body":
                            //             content = node.getText();
                            //             that.logger.log("info", LOG_ID + "(handleXMPPConnection) message - content", "***");
                            //             if (node.attrs["xml:lang"]) { // in <body>
                            //                 lang = node.attrs["xml:lang"];
                            //             } else if (node.parent.attrs["xml:lang"]) { // in <message>
                            //                 lang = node.parent.attrs["xml:lang"];
                            //             } else {
                            //                 lang = "en";
                            //             }
                            //             that.logger.log("info", LOG_ID + "(handleXMPPConnection) message - lang", lang);
                            //             hasATextMessage = true;
                            //             break;
                            //         case "content":
                            //             alternativeContent.push( {
                            //                 "message": node.getText(),
                            //                 "type": node.getAttr("type")
                            //             });
                            //             break;
                            //         case "request":
                            //             that.logger.log("info", LOG_ID + "(handleXMPPConnection) message - asked for receipt");
                            //             // Acknowledge 'received'
                            //             let stanzaReceived = xml("message", {
                            //                 "to": fromJid,
                            //                 "from": toJid,
                            //                 "type": messageType
                            //             }, xml("received", {
                            //                 "xmlns": NameSpacesLabels.ReceiptsNameSpace,
                            //                 "event": "received",
                            //                 "entity": "client",
                            //                 "id": stanza.attrs.id
                            //                 })
                            //             );

                            //             that.logger.log("info", LOG_ID + "(handleXMPPConnection) answered - send receipt 'received'", stanzaReceived.root().toString());
                            //             that.xmppClient.send(stanzaReceived);

                            //             //Acknowledge 'read'
                            //             if (that.shouldSendReadReceipt || (messageType === TYPE_GROUPCHAT && that.xmppUtils.getResourceFromFullJID(stanza.attrs.from) === that.fullJid)) {

                            //                 let stanzaRead = xml("message", {
                            //                     "to": fromJid,
                            //                     "from": toJid,
                            //                     "type": messageType
                            //                 }, xml("received", {
                            //                         "xmlns": NameSpacesLabels.ReceiptsNameSpace,
                            //                         "event": "read",
                            //                         "entity": "client",
                            //                         "id": stanza.attrs.id
                            //                     })
                            //                 );
                            //                 that.logger.log("info", LOG_ID + "(handleXMPPConnection) answered - send receipt 'read'", stanzaRead.root().toString());
                            //                 that.xmppClient.send(stanzaRead);
                            //             }
                            //             break;
                            //         case "x":
                            //             {
                            //                 let xmlns = node.attrs.xmlns;
                            //                 switch ( xmlns) {
                            //                    case "jabber:x:conference": {
                            //                         let invitation = {
                            //                             event: "invitation",
                            //                             bubbleId: node.attrs.thread,
                            //                             bubbleJid: node.attrs.jid,
                            //                             fromJid: fromJid,
                            //                             resource: resource
                            //                         };
                            //                         that.logger.log("info", LOG_ID + "(handleXMPPConnection) invitation received");
                            //                         that.eventEmitter.emit("rainbow_invitationreceived", invitation);
                            //                     }
                            //                     break;
                            //                     case NameSpacesLabels.OobNameSpace : {
                            //                         oob = {
                            //                             url: node.getChild("url").getText(),
                            //                             mime: node.getChild("mime").getText(),
                            //                             filename: node.getChild("filename").getText(),
                            //                             filesize: node.getChild("size").getText()
                            //                         };
                            //                         that.logger.log("info", LOG_ID + "(handleXMPPConnection) oob received");
                            //                         break;
                            //                     }
                            //                     default:
                            //                         break;
                            //                 }
                            //                 break;
                            //             }
                            //         default:
                            //             break;
                            //     }
                            // });

                            // let fromBubbleJid = "";
                            // let fromBubbleUserJid = "";
                            // if (stanza.attrs.type === TYPE_GROUPCHAT) {
                            //     fromBubbleJid = that.xmppUtils.getBareJIDFromFullJID(stanza.attrs.from);
                            //     fromBubbleUserJid = that.xmppUtils.getResourceFromFullJID(stanza.attrs.from);
                            //     resource = that.xmppUtils.getResourceFromFullJID(fromBubbleUserJid);
                            // }

                            // if (hasATextMessage && ((messageType === TYPE_GROUPCHAT && fromBubbleUserJid !== that.fullJid) || (messageType === TYPE_CHAT && fromJid !== that.fullJid))) {
                            //     that.logger.log("info", LOG_ID + "(handleXMPPConnection) message - chat message received");

                            //     let data = {
                            //         "fromJid": fromJid,
                            //         "resource": resource,
                            //         "toJid": toJid,
                            //         "type": messageType,
                            //         "content": content,
                            //         "alternativeContent": alternativeContent,
                            //         "id": stanza.attrs.id,
                            //         "lang": lang,
                            //         "cc": false,
                            //         "cctype": "",
                            //         "isEvent": false,
                            //         "oob": oob
                            //     };

                            //     if (stanza.attrs.type === TYPE_GROUPCHAT) {
                            //         data.fromBubbleJid = fromBubbleJid;
                            //         data.fromBubbleUserJid = fromBubbleUserJid;
                            //         data.fromJid = that.xmppUtils.getRoomJIDFromFullJID(stanza.attrs.from);

                            //         if(event) {
                            //             data.event = event;
                            //             data.eventJid = eventJid;
                            //             data.isEvent = true;
                            //         }
                            //     }

                            //     that.eventEmitter.emit("rainbow_onmessagereceived", data);
                            // }
                        } else if (stanza.attrs.type === "management") {
                            // let children = stanza.children;
                            // children.forEach(function (node) {
                            //     switch (node.getName()) {
                            //         case "room":
                            //             if (node.attrs.xmlns === "jabber:iq:configuration") {

                            //                 // Affiliation changed (my own or for a member)
                            //                 if (node.attrs.status) {
                            //                     if (node.attrs.userjid === that.xmppUtils.getBareJIDFromFullJID(that.fullJid)) {
                            //                         that.logger.log("debug", LOG_ID + "(handleXMPPConnection) bubble management received for own.");
                            //                         that.eventEmitter.emit("rainbow_ownaffiliationchanged", {
                            //                             "bubbleId": node.attrs.roomid,
                            //                             "bubbleJid": node.attrs.roomjid,
                            //                             "userJid": node.attrs.userjid,
                            //                             "status": node.attrs.status,
                            //                         });
                            //                     } else {
                            //                         that.logger.log("debug", LOG_ID + "(handleXMPPConnection) bubble affiliation received");
                            //                         that.eventEmitter.emit("rainbow_affiliationchanged", {
                            //                             "bubbleId": node.attrs.roomid,
                            //                             "bubbleJid": node.attrs.roomjid,
                            //                             "userJid": node.attrs.userjid,
                            //                             "status": node.attrs.status,
                            //                         });
                            //                     }
                            //                 }
                            //                 // Custom data changed
                            //                 else if (node.attrs.customData) {
                            //                     that.logger.log("debug", LOG_ID + "(handleXMPPConnection) bubble custom-data changed");
                            //                     that.eventEmitter.emit("rainbow_customdatachanged", {
                            //                         "bubbleId": node.attrs.roomid,
                            //                         "bubbleJid": node.attrs.roomjid,
                            //                         "customData": node.attrs.customData
                            //                     });
                            //                 }
                            //                 // Topic changed
                            //                 else if (node.attrs.topic) {
                            //                     that.logger.log("debug", LOG_ID + "(handleXMPPConnection) bubble topic changed");
                            //                     that.eventEmitter.emit("rainbow_topicchanged", {
                            //                         "bubbleId": node.attrs.roomid,
                            //                         "bubbleJid": node.attrs.roomjid,
                            //                         "topic": node.attrs.topic
                            //                     });
                            //                 }
                            //                 // Name changed
                            //                 else if (node.attrs.name) {
                            //                     that.logger.log("debug", LOG_ID + "(handleXMPPConnection) bubble name changed");
                            //                     that.eventEmitter.emit("rainbow_namechanged", {
                            //                         "bubbleId": node.attrs.roomid,
                            //                         "bubbleJid": node.attrs.roomjid,
                            //                         "name": node.attrs.name
                            //                     });
                            //                 }
                            //             }
                            //             break;
                            //         case "usersettings":
                            //             if (node.attrs.xmlns === "jabber:iq:configuration") {
                            //                 switch (node.attrs.action) {
                            //                     case "update":
                            //                         that.logger.log("debug", LOG_ID + "(handleXMPPConnection) usersettings updated");
                            //                         that.eventEmitter.emit("rainbow_usersettingschanged");
                            //                         break;
                            //                     default:
                            //                         break;
                            //                 }
                            //             }
                            //             break;
                            //         case "userinvite":
                            //             if (node.attrs.xmlns === "jabber:iq:configuration") {
                            //                 switch (node.attrs.action) {
                            //                     case "create":
                            //                         if (node.attrs.type === "received" && node.attrs.status === "pending") {
                            //                             that.logger.log("debug", LOG_ID + "(handleXMPPConnection) user invite received");
                            //                             that.eventEmitter.emit("rainbow_userinvitereceived", {
                            //                                 invitationId: node.attrs.id
                            //                             });
                            //                         }
                            //                     case "update":
                            //                         if( node.attrs.type === "sent" && node.attrs.status === "canceled" ) {
                            //                             that.logger.log("debug", LOG_ID + "(handleXMPPConnection) user invite canceled");
                            //                             that.eventEmitter.emit("rainbow_userinvitecanceled", {
                            //                                 invitationId: node.attrs.id
                            //                             });
                            //                         } else if( node.attrs.type === "sent" && node.attrs.status === "accepted" ) {
                            //                             that.logger.log("debug", LOG_ID + "(handleXMPPConnection) user invite accepted");
                            //                             that.eventEmitter.emit("rainbow_userinviteaccepted", {
                            //                                 invitationId: node.attrs.id
                            //                             });
                            //                         }
                            //                         break;
                            //                     default:
                            //                         break;
                            //                 }
                            //             }
                            //         case "group":
                            //             if (node.attrs.xmlns === "jabber:iq:configuration") {
                            //                 let action = node.attrs.action;
                            //                 let scope = node.attrs.scope;

                            //                 if (action === "create" && scope === "group") {
                            //                     that.logger.log("debug", LOG_ID + "(handleXMPPConnection) group created");
                            //                     that.eventEmitter.emit("rainbow_groupcreated", {
                            //                         "groupId": node.attrs.id
                            //                     });
                            //                 } else if (action === "create" && scope === "user" && node.attrs.userId) {
                            //                     that.logger.log("debug", LOG_ID + "(handleXMPPConnection) user added in group");
                            //                     that.eventEmitter.emit("rainbow_useraddedingroup", {
                            //                         "groupId": node.attrs.id,
                            //                         "userId": node.attrs.userId
                            //                     });
                            //                 } else if (action === "delete" && scope === "group") {
                            //                     that.logger.log("debug", LOG_ID + "(handleXMPPConnection) group deleted");
                            //                     that.eventEmitter.emit("rainbow_groupdeleted", {
                            //                         "groupId": node.attrs.id
                            //                     });
                            //                 } else if (action === "delete" && scope === "user" && node.attrs.userId) {
                            //                     that.logger.log("debug", LOG_ID + "(handleXMPPConnection) user removed from group");
                            //                     that.eventEmitter.emit("rainbow_userremovedfromgroup", {
                            //                         "groupId": node.attrs.id,
                            //                         "userId": node.attrs.userId
                            //                     });
                            //                 } else if (action === "update" && scope === "group") {
                            //                     if (node.attrs.name || node.attrs.comment || node.attrs.isFavorite) {
                            //                         that.logger.log("debug", LOG_ID + "(handleXMPPConnection) group updated");
                            //                         that.eventEmitter.emit("rainbow_groupupdated", {
                            //                             "groupId": node.attrs.id
                            //                         });
                            //                     }
                            //                 }
                            //             }
                            //             break;
                            //         default:
                            //             break;
                            //     }
                            // });
                        } else if (stanza.attrs.type === "error") {
                            //that.logger.log("error", LOG_ID + "(handleXMPPConnection) something goes wrong...");
                        } else if (stanza.attrs.type === "headline") {

                            // that.logger.log("info", LOG_ID + "(handleXMPPConnection) channel message received");

                            // let eventNode = stanza.children[0];
                            // let items = eventNode.children[0];
                            // let item = items.children[0];
                            // let entry = item.children[0];

                            // let message = {
                            //     "messageId": item.attrs.id,
                            //     "channelId": entry.attrs.channelId,
                            //     "fromJid": entry.attrs.from,
                            //     "message": entry.getChild("message").getText() || "",
                            //     "title": entry.getChild("title").getText() ||  "",
                            //     "url": entry.getChild("url").getText() ||  "",
                            //     "date": new Date(entry.attrs.timestamp)
                            // };

                            // that.eventEmitter.emit("rainbow_onchannelmessagereceived", message);

                        } else {
                            let children = stanza.children;

                            children.forEach(function (node) {
                                switch (node.getName()) {
                                    case "received":
                                        let receipt = {
                                            event: node.attrs.event,
                                            entity: node.attrs.entity,
                                            type: null,
                                            id: node.attrs.id
                                        };
                                        that
                                            .logger
                                            .log("info", LOG_ID + "(handleXMPPConnection) server receipt received");
                                        that
                                            .eventEmitter
                                            .emit("rainbow_onreceipt", receipt);
                                        break;
                                    default:
                                        break;
                                }
                            });
                        }
                        break;
                    case "presence":
                        // let from = stanza.attrs.from;
                        // if (from === that.fullJid || that.xmppUtils.getBareJIDFromFullJID(from) === that.xmppUtils.getBareJIDFromFullJID(that.fullJid)) {
                        //     // My presence changes (coming from me or another resource)
                        //     that
                        //         .eventEmitter
                        //         .emit("rainbow_onpresencechanged", {
                        //             fulljid: from,
                        //             jid: that.xmppUtils.getBareJIDFromFullJID(from),
                        //             resource: that.xmppUtils.getResourceFromFullJID(from),
                        //             show: stanza.attrs.show || "online",
                        //             status: stanza.attrs.status || "",
                        //             type: that.xmppUtils.isFromTelJid(from)
                        //                 ? "phone"
                        //                 : that.xmppUtils.isFromMobile(from)
                        //                     ? "mobile"
                        //                     : that.xmppUtils.isFromNode(from)
                        //                         ? "node"
                        //                         : "desktopOrWeb"
                        //         });
                        // } else if (from.includes("room_")) {

                        //     let children = stanza.children;
                        //     children.forEach(function (node) {
                        //         switch (node.getName()) {
                        //             case "x":
                        //                 let items = node.children;
                        //                 items.forEach(function (item) {
                        //                     switch (item.getName()) {
                        //                         case "item":
                        //                             break;
                        //                         case "status":
                        //                             break;
                        //                         default:
                        //                             break;
                        //                     }
                        //                 });
                        //                 break;
                        //             default:
                        //                 break;
                        //         }
                        //     });

                        //     // A presence in a room changes
                        //     let fullJid = that.xmppUtils.getResourceFromFullJID(from);
                        //     if (that.xmppUtils.getBareJIDFromFullJID(fullJid) === that.xmppUtils.getBareJIDFromFullJID(that.fullJid)) {
                        //         // My presence (node or other resources) in the room changes
                        //         that
                        //             .eventEmitter
                        //             .emit("rainbow_onbubblepresencechanged", {
                        //                 fulljid: from,
                        //                 jid: that.xmppUtils.getBareJIDFromFullJID(from),
                        //                 resource: that.xmppUtils.getResourceFromFullJID(from)
                        //             });
                        //     } else {
                        //         // Presence of a participants of the room changes
                        //         that
                        //             .eventEmitter
                        //             .emit("rainbow_onbubblerosterpresencechanged", {
                        //                 fulljid: from,
                        //                 jid: that.xmppUtils.getBareJIDFromFullJID(from),
                        //                 resource: that.xmppUtils.getResourceFromFullJID(from)
                        //             });
                        //     }

                        // } else {
                        //     // Presence of a contact changes
                        //     let priority = 5;
                        //     let show = "";
                        //     let delay = "";
                        //     let status = "";
                        //     if (stanza.attrs.type === "unavailable") {
                        //         show = "unavailable";
                        //     } else {
                        //         let children = stanza.children;
                        //         children.forEach(function (node) {
                        //             if (node && typeof node !== "string") {
                        //                 switch (node.getName()) {
                        //                     case "priority":
                        //                         priority = node.getText() || 5;
                        //                         break;
                        //                     case "show":
                        //                         show = node.getText() || "online";
                        //                         break;
                        //                     case "delay":
                        //                         delay = node.attrs.stamp || "";
                        //                         break;
                        //                     case "status":
                        //                         status = node.getText() || "";
                        //                         break;
                        //                     default:
                        //                         break;
                        //                 }
                        //             }
                        //         });
                        //     }

                        //     that.eventEmitter.emit("rainbow_onrosterpresence", {
                        //         fulljid: from,
                        //         jid: that.xmppUtils.getBareJIDFromFullJID(from),
                        //         resource: that.xmppUtils.getResourceFromFullJID(from),
                        //         value: {
                        //             priority: priority,
                        //             show: show || "",
                        //             delay: delay,
                        //             status: status || "",
                        //             type: that.xmppUtils.isFromTelJid(from) ? "phone" : that.xmppUtils.isFromMobile(from) ? "mobile" : that.xmppUtils.isFromNode(from) ? "node" : "desktopOrWeb"
                        //         }
                        //     });
                        // }
                        break;
                    case "close":
                        break;
                    default:
                        that.logger.log("warn", LOG_ID + "(handleXMPPConnection) not managed - 'stanza'", stanza.getName());
                        break;
                }
            });

            this.xmppClient.on(ERROR_EVENT, async (err) => {
                if (err.code === "HPE_INVALID_CONSTANT") {
                    return;
                }
                that.logger.log("debug", LOG_ID + "(handleXMPPConnection) event - ERROR_EVENT : " + ERROR_EVENT + " |", util.inspect(err.condition || err));
                that.stopIdleTimer();
                if (that.reconnect) {
                    if (err.condition === "system-shutdown") { // && err.condition != "conflict"
                        that.logger.log("debug", LOG_ID + "(handleXMPPConnection) event - ERROR_EVENT :  wait 10 seconds before try to reconnect");
                        await setTimeoutPromised(3000);
                        if (!that.isReconnecting) {
                            that.logger.log("debug", LOG_ID + "(handleXMPPConnection) event - ERROR_EVENT : try to reconnect...");
                            that.reconnect.reconnect();
                        } else {
                            that.logger.log("debug", LOG_ID + "(handleXMPPConnection) event - ERROR_EVENT : Do nothing, already trying to reconnect...");
                        }
                    } else {
                        that.logger.log("debug", LOG_ID + "(handleXMPPConnection) event - ERROR_EVENT : no reconnection for condition : ", err.condition);
                        that.eventEmitter.emit("rainbow_onxmpperror", err);
                    }
                } else {
                    that.logger.log("debug", LOG_ID + "(handleXMPPConnection) event - ERROR_EVENT : reconnection disabled so no reconnect");
                }
            });

            this.xmppClient.on(OFFLINE_EVENT, (msg) => {
                that.logger.log("debug", LOG_ID + "(handleXMPPConnection) event - OFFLINE_EVENT : " + OFFLINE_EVENT + " |" + msg);
            });

            this.xmppClient.on(CONNECT_EVENT, () => {
                that.logger.log("debug", LOG_ID + "(handleXMPPConnection) event - CONNECT_EVENT : " + CONNECT_EVENT);
            });

            this.xmppClient.on(RECONNECT_EVENT, (msg) => {
                that.logger.log("debug", LOG_ID + "(handleXMPPConnection) event - RECONNECT_EVENT : " + RECONNECT_EVENT + " |" + msg);
            });

            this.xmppClient.on(DISCONNECT_EVENT, async () => {
                that.logger.log("debug", LOG_ID + "(handleXMPPConnection) event - DISCONNECT_EVENT : " + DISCONNECT_EVENT + " |");
                that.eventEmitter.emit("rainbow_xmppdisconnect");
                if (that.reconnect) {
                    that.logger.log("debug", LOG_ID + "(handleXMPPConnection) event - DISCONNECT_EVENT : wait 3 seconds before try to reconnect");
                    await setTimeoutPromised(3000);
                    if (!that.isReconnecting) {
                        that.logger.log("debug", LOG_ID + "(handleXMPPConnection) event - DISCONNECT_EVENT : try to reconnect...");
                        that.reconnect.reconnect();
                    } else {
                        that.logger.log("debug", LOG_ID + "(handleXMPPConnection)  event - DISCONNECT_EVENT : Do nothing, already trying to reconnect...");
                    }
                } else {
                    that.logger.log("debug", LOG_ID + "(handleXMPPConnection) event - DISCONNECT_EVENT : reconnection disabled so no reconnect");
                }
            });

            this.xmppClient.on(CLOSE_EVENT, (msg) => {
                that.logger.log("debug", LOG_ID + "(handleXMPPConnection) event - CLOSE_EVENT : " + CLOSE_EVENT + " |" + msg);
            });

            this.xmppClient.on(END_EVENT, (msg) => {
                that.logger.log("debug", LOG_ID + "(handleXMPPConnection) event - END_EVENT : " + END_EVENT + " |" + msg);
            });

            this.reconnect.on(RECONNECTING_EVENT, () => {
                that.logger.log("debug", LOG_ID + "(handleXMPPConnection) plugin event - RECONNECTING_EVENT : " + RECONNECTING_EVENT);
                that.reconnect.delay = that.fibonacciStrategy.next();
                that.logger.log("debug", `${LOG_ID} (handleXMPPConnection) update reconnect delay - ${that.reconnect.delay} ms`);

                that.eventEmitter.emit("rainbow_xmppreconnectingattempt");
                this.isReconnecting = true;
            });

            this.reconnect.on(RECONNECTED_EVENT, () => {
                that.logger.log("debug", LOG_ID + "(handleXMPPConnection) plugin event - RECONNECTED_EVENT : " + RECONNECTED_EVENT);
                that.fibonacciStrategy.reset();
                that.reconnect.delay = that.fibonacciStrategy.getInitialDelay();
                that.isReconnecting = false;
                that.initialPresence = true;
                that.eventEmitter.emit("rainbow_xmppreconnected");
            });


            this.xmppClient.start({
                uri: this.serverURL + "?x-rainbow-xmpp-dom=" + domain,
                domain: domain
            }).then((jid) => {
                /* <iq type='get'
                    from='romeo@montague.net/orchard'
                    to='plays.shakespeare.lit'
                    id='info1'>
                        <query xmlns='http://jabber.org/protocol/disco#info'/>
                        </iq> // */
                /*
                Iq to discover the services provided by rainbow xmpp server
                let stanza = xml("iq", {
                    //to: that.jid_im + "/" + that.fullJid,
                    "type": "get",
                    "to": domain,
                    "id": that.xmppUtils.getUniqueMessageId()
                }, xml("query", {"xmlns": "http://jabber.org/protocol/disco#info"}));

                that.logger.log("internal", LOG_ID + "(handleXMPPConnection) send IQ disco", stanza.root().toString());
                return that.xmppClient.send(stanza);
                // */

            }) // */
            /*
            this.xmppClient.start().then((jid) => {
                that.logger.log("info", "started", jid.toString());
            })// */
                .catch(err => {
                    // rejects for any error before online
                    if (err.code === "HPE_INVALID_CONSTANT") {
                        that.logger.log("error", LOG_ID + "start reconnect ", err);
                        that.reconnect.reconnect();
                        return;
                    }

                    that.logger.log("error", LOG_ID + "start failed", err);
                });
        };
    }

    start(withXMPP) {
        let that = this;
        this.forceClose = false;
        this
            .logger
            .log("debug", LOG_ID + "(start) _entering_");

        return new Promise(function (resolve, reject) {
            try {
                if (withXMPP) {
                    that.logger.log("debug", LOG_ID + "(start) host used", that.host);
                    that.logger.log("info", LOG_ID + "(start) XMPP URL", that.serverUR);
                } else {
                    that.logger.log("info", LOG_ID + "(start) XMPP connection blocked by configuration");
                }
                that.isReconnecting = false;
                that.useXMPP = withXMPP;
                that.logger.log("debug", LOG_ID + "(start) _exiting_");
                resolve();
            } catch (err) {
                that.logger.log("debug", LOG_ID + "(start) _exiting_");
                reject(err);
            }
        });
    }

    signin(account, headers) {
        let that = this;

        return new Promise(function (resolve) {
            that.IQEventHandlerToken = [];

            that.eventEmitter.once("xmppconnected", function fn_xmppconnected() {
                that.eventEmitter.removeListener("xmppconnected", fn_xmppconnected);
                resolve();
            });

            if (that.useXMPP) {
                that.logger.log("debug", LOG_ID + "(signin) _entering_");
                that.jid_im = account.jid_im;
                that.jid_tel = account.jid_tel;
                that.jid_password = account.jid_password;
                that.userId = account.id;
                that.fullJid = that.xmppUtils.generateRandomFullJidForNode(that.jid_im, that.generatedRandomId);
                that.jid = account.jid_im;

                that.logger.log("internal", LOG_ID + "(signin) account used, jid_im : ", that.jid_im, ", fullJid : ", that.fullJid);

                that.IQEventHandler = new IQEventHandler(that);

                that.IQEventHandlerToken = [
                    PubSub.subscribe(that.hash + "." + that.IQEventHandler.IQ_GET, that.IQEventHandler.onIqGetReceived),
                    PubSub.subscribe(that.hash + "." + that.IQEventHandler.IQ_SET, that.IQEventHandler.onIqGetReceived),
                    PubSub.subscribe(that.hash + "." + that.IQEventHandler.IQ_RESULT, that.IQEventHandler.onIqResultReceived)
                ];

                that.handleXMPPConnection(headers);
                that.IQEventHandlerToken.push(PubSub.subscribe(that.hash + "." + that.IQEventHandler.IQ_RESULT, that.xmppClient.onIqResultReceived));
                that.IQEventHandlerToken.push(PubSub.subscribe(that.hash + "." + that.IQEventHandler.IQ_ERROR, that.xmppClient.onIqErrorReceived));

                that.startOrResetIdleTimer();
                that.logger.log("debug", LOG_ID + "(signin) _exiting_");
                //resolve();
            } else {
                resolve();
            }
        });
    }

    stop(forceStop) {
        let that = this;
        this.logger.log("debug", LOG_ID + "(stop) _entering_");

        return new Promise(function (resolve) {

            try {
                that.stopIdleTimer();

                that.jid_im = "";
                that.jid_tel = "";
                that.jid_password = "";
                that.fullJid = "";
                that.userId = "";
                that.initialPresence = true;

                if (that.useXMPP && forceStop) {

                    delete that.IQEventHandler;
                    that.IQEventHandler = null;

                    that.IQEventHandlerToken.forEach((token) => PubSub.unsubscribe(token));
                    that.IQEventHandlerToken = [];

                    that.forceClose = true;

                    // Disconnect the auto-reconnect mode
                    if (that.reconnect) {
                        that.logger.log("debug", LOG_ID + "(stop) stop XMPP auto-reconnect mode");
                        that.reconnect.stop();
                        that.reconnect = null;
                    }

                    // Disconnect the xmpp connection
                    if (that.xmppClient) {
                        let stanza = xml("presence", {
                            //to: that.jid_im + "/" + that.fullJid,
                            type: "unavailable"
                        }, xml("x", {"xmlns": NameSpacesLabels.MucNameSpace}));
                        stanza.append(xml("show", {}, "away"));
                        stanza.append(xml("status", {}, "away"));

                        that.logger.log("internal", LOG_ID + "(stop) send Unavailable Presence- send - 'message'", stanza.root().toString());
                        that.xmppClient.send(stanza);

                        that.xmppClient.stop().then(() => {
                            that.logger.log("debug", LOG_ID + "(stop) stop XMPP connection");
                            that.xmppClient = null;
                            that.logger.log("debug", LOG_ID + "(stop) _exiting_");
                            resolve();
                        }).catch((err) => {
                            that.logger.log("debug", LOG_ID + "(stop) error received", err);
                            that.logger.log("debug", LOG_ID + "(stop) _exiting_");
                            resolve();
                        });
                    } else {
                        that.logger.log("debug", LOG_ID + "(stop) nothing to stop");
                        that.logger.log("debug", LOG_ID + "(stop) _exiting_");
                        resolve();
                    }
                } else {
                    that.logger.log("debug", LOG_ID + "(stop) nothing to stop");
                    that.logger.log("debug", LOG_ID + "(stop) _exiting_");
                    resolve();
                }
            } catch (err) {
                that.logger.log("debug", LOG_ID + "(stop) error received", err);
                that.logger.log("debug", LOG_ID + "(stop) _exiting_");
                resolve();
            }
        });
    }

    startOrResetIdleTimer(incomingStanza = false) {
        if ((this.pingTimer && !incomingStanza) || (this.reconnect && this.reconnect.isReconnecting)) {
            return;
        }
        this.stopIdleTimer();
        if (!this.forceClose) {
            this.idleTimer = setTimeout(() => {
                this.logger.log("warn", LOG_ID + "(startOrResetIdleTimer) No message received since " + MAX_IDLE_TIMER / 1000 + " seconds.");
                // Start waiting an answer from server else reset the connection
                this.pingTimer = setTimeout(() => {
                    this.pingTimer = null;
                    this.xmppClient.socket && this.xmppClient.socket.end();
                }, MAX_PING_ANSWER_TIMER);
                this.sendPing();
            }, MAX_IDLE_TIMER);
        }
    }

    stopIdleTimer() {
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
            this.idleTimer = null;
        }
        if (this.pingTimer) {
            clearTimeout(this.pingTimer);
            this.pingTimer = null;
        }
    }

    setPresence(show, status) {
        let that = this;
        this
            .logger
            .log("debug", LOG_ID + "(setPresence) _entering_");
        if (this.useXMPP) {
            let stanza = xml("presence", {"id": that.xmppUtils.getUniqueMessageId()});

            if (this.initialPresence) {
                this.initialPresence = false;
                stanza.append(xml("application",
                    {xmlns: NameSpacesLabels.ApplicationNameSpace},
                    xml("appid", {}, this.applicationId),
                    xml("userid", {}, this.userId)));
            }

            stanza.append(xml("priority", {}, "5"));

            if (show && show !== "online") {
                stanza.append(xml("show", {}, show));
            }

            if (status && (!show || show === "online")) {
                stanza.append(xml("status", {}, status));
            } else if (status) {
                stanza.append(xml("status", {}, status));
            }
            this.logger.log("info", LOG_ID + "(setPresence) send - 'stanza'");
            this.logger.log("internal", LOG_ID + "(setPresence) send - 'stanza'", stanza.toString());
            this.logger.log("debug", LOG_ID + "(setPresence) _exiting_");
            return this.xmppClient.send(stanza);
        } else {
            this.logger.log("warn", LOG_ID + "(setPresence) No XMPP connection...");
            this.logger.log("debug", LOG_ID + "(setPresence) _exiting_");
            return Promise.resolve();
        }
    }

    //Message Carbon XEP-0280
    enableCarbon() {
        let that = this;
        this
            .logger
            .log("debug", LOG_ID + "(enableCarbon) _entering_");
        if (this.useXMPP) {
            let stanza = xml("iq", {
                "type": "set",
                id: "enable_xmpp_carbon"
            }, xml("enable", {xmlns: NameSpacesLabels.Carbon2NameSpace}));
            this
                .logger
                .log("info", LOG_ID + "(enableCarbon) send - 'stanza'", stanza.toString());
            that
                .logger
                .log("debug", LOG_ID + "(enableCarbon) _exiting_");
            return new Promise((resolve, reject) => {
                that
                    .xmppClient
                    .send(stanza).then(() => {
                    that.logger.log("debug", LOG_ID + "(enableCarbon) sent");
                    resolve();
                }).catch((err) => {
                    reject(err);
                });
            });
        }

        that.logger.log("warn", LOG_ID + "(enableCarbon) No XMPP connection...");
        that.logger.log("debug", LOG_ID + "(enableCarbon) _exiting_");
        return Promise.resolve(null);
    }

    sendChatMessage(message, jid, lang, content, subject, answeredMsg) {
        let that = this;
        that.logger.log("debug", LOG_ID + "(sendChatMessage) _entering_");
        if (that.useXMPP) {
            let id = that.xmppUtils.getUniqueMessageId();

            // Remove resource if exists
            jid = that.xmppUtils.getBareJIDFromFullJID(jid);

            let stanza = xml("message", {
                // "from": this.fullJid,
                "to": jid,
                "xmlns": NameSpacesLabels.ClientNameSpace,
                "type": TYPE_CHAT,
                "id": id
            }, xml("body", {
                "xml:lang": lang
            }, message), xml("request", {
                    "xmlns": NameSpacesLabels.ReceiptsNameSpace
                }, xml("active", {
                    "xmlns": NameSpacesLabels.ChatestatesNameSpace
                })
            ));

            let answeredMsgId = null;
            let answeredMsgDate = null;
            if ( answeredMsg ) {
                stanza.append(xml("answeredMsg", { "stamp": answeredMsg.date.getTime() }, answeredMsg.id));
                answeredMsgId = answeredMsg.id;
                answeredMsgDate = answeredMsg.date;
                that.logger.log("debug", LOG_ID + "(sendChatMessage) answeredMsg : ", stanza);
            }


            if (subject) {
                stanza.append(xml("subject", {
                    "xml:lang": lang
                }, subject));
            }

            if (content && content.message) {
                let contentType = content.type || "text/markdown";
                stanza.append(xml("content", {
                    "type": contentType,
                    "xmlns": NameSpacesLabels.ContentNameSpace
                }, content.message));
            }

            that
                .logger
                .log("info", LOG_ID + "(sendChatMessage) send - 'message'", stanza.toString());
            that
                .logger
                .log("debug", LOG_ID + "(sendChatMessage) _exiting_");
            return new Promise((resolve, reject) => {
                that
                    .xmppClient
                    .send(stanza).then(() => {
                    that.logger.log("debug", LOG_ID + "(sendChatMessage) sent");
                    resolve({from: this.jid_im, to: jid, type: "chat", id: id, date: new Date(), content: message});
                }).catch((err) => {
                    reject(err);
                });
            });
        }

        that
            .logger
            .log("warn", LOG_ID + "(sendChatMessage) No XMPP connection...");
        that
            .logger
            .log("debug", LOG_ID + "(sendChatMessage) _exiting_");
        return Promise.resolve(null);
    }

    sendChatMessageToBubble(message, jid, lang, content, subject, answeredMsg) {
        let that = this;
        that
            .logger
            .log("debug", LOG_ID + "(sendChatMessageToBubble) _entering_");
        if (that.useXMPP) {
            let id = that.xmppUtils.getUniqueMessageId();

            let stanza = xml("message", {
                "to": jid,
                "type": TYPE_GROUPCHAT,
                "id": id
            }, xml("body", {
                "xml:lang": lang
            }, message), xml("request", {
                    "xmlns": NameSpacesLabels.ReceiptsNameSpace
                }, xml("active", {
                    "xmlns": NameSpacesLabels.ChatestatesNameSpace
                })
            ));

            if (subject) {
                stanza.append(xml("subject", {
                    "xml:lang": lang
                }, subject));
            }

            let answeredMsgId = null;
            let answeredMsgDate = null;
            if ( answeredMsg ) {
                stanza.append(xml("answeredMsg", { "stamp": answeredMsg.date.getTime() }, answeredMsg.id));
                answeredMsgId = answeredMsg.id;
                answeredMsgDate = answeredMsg.date;
                that.logger.log("debug", LOG_ID + "(sendChatMessageToBubble) answeredMsg : ", stanza);
            }

            if (content && content.message) {
                let contentType = content.type || "text/markdown";
                stanza.append(xml("content", {
                    "type": contentType,
                    "xmlns": NameSpacesLabels.ContentNameSpace
                }, content.message));
            }

            that
                .logger
                .log("info", LOG_ID + "(sendChatMessageToBubble) send - 'message'", stanza.toString());

            that
                .logger
                .log("debug", LOG_ID + "(sendChatMessageToBubble) _exiting_");
            return new Promise((resolve, reject) => {
                that
                    .xmppClient
                    .send(stanza).then(() => {
                    that.logger.log("debug", LOG_ID + "(sendChatMessageToBubble) sent");
                    resolve({
                        from: this.jid_im,
                        to: jid,
                        type: "groupchat",
                        id: id,
                        date: new Date(),
                        message: message,
                        content: content,
                        subject: subject,
                        lang: lang,
                        answeredMsg: answeredMsg
                    });
                }).catch((err) => {
                    reject(err);
                });
            });
        }

        that
            .logger
            .log("warn", LOG_ID + "(sendChatMessageToBubble) No XMPP connection...");
        that
            .logger
            .log("debug", LOG_ID + "(sendChatMessageToBubble) _exiting_");
        return Promise.resolve(null);

        //return null;

    }

    async sendCorrectedChatMessage(conversation, originalMessage, data, origMsgId, lang) {
        let that = this;
        that.logger.log("debug", LOG_ID + "(sendCorrectedChatMessage) _entering_");
//        $log.info("[Conversation] >sendCorrectedChatMessage: origMsgId=" + origMsgId)

        /* <message to='juliet@capulet.net/balcony' id='good1'>
        <body>But soft, what light through yonder window breaks?</body>
        <replace id='bad1' xmlns='urn:xmpp:message-correct:0'/>
        <store xmlns='urn:xmpp:hints'/>
        </message> */

        // this.sendAckReadMessages();

        let xmppMessage = null;
        // Build the message ID
        let messageToSendID = that.xmppUtils.getUniqueMessageId();
        that.logger.log("debug", LOG_ID + "(sendCorrectedChatMessage) : messageToSendID : " + messageToSendID);

        // Handle One to one conversation message
        if (conversation.type === Conversation.Type.ONE_TO_ONE) {
            let to = conversation.id; //this.contact.jid;
            xmppMessage = xml("message", {to: to, type: "chat", id: messageToSendID, "xml:lang": lang},
                xml("body", {"xml:lang": lang}, data),
                xml("replace", {id: origMsgId, "xmlns": NameSpacesLabels.MessageCorrectNameSpace}),
                xml("store", {"xmlns": NameSpacesLabels.HintsNameSpace}),
                xml("request", {"xmlns": NameSpacesLabels.ReceiptNS}),
                xml("active", {"xmlns": NameSpacesLabels.ChatstatesNS})
            );
        }
        // Handle Room conversation message
        else {
            xmppMessage = xml("message", {to: conversation.bubble.jid, type: "groupchat", id: messageToSendID},
                xml("body", {"xml:lang": lang}, data),
                xml("replace", {id: origMsgId, "xmlns": NameSpacesLabels.MessageCorrectNameSpace}),
                xml("store", {"xmlns": NameSpacesLabels.HintsNameSpace}),
                xml("request", {"xmlns": NameSpacesLabels.ReceiptNS}),
                xml("active", {"xmlns": NameSpacesLabels.ChatstatesNS})
            );
        }

        // message = this.addChatReplaceMessage(contactService.userContact, new Date(), unicodeData, messageToSendID, true);
        if (!originalMessage) {
            return null;
        }
        /* WEB SDK :
        originalMessage.serverAckTimer = $interval(function() {
            originalMessage.receiptStatus = Message.ReceiptStatus.ERROR;
            that.updateMessage(originalMessage);
        }, 10000);

        // Add message in messages array
        originalMessage.addReplaceMsg(messageToSendID, data);
        //*/

        // Create and send message
        that.xmppClient.send(xmppMessage);

        return messageToSendID;
    }

    markMessageAsRead(message) {
        let that = this;
        this
            .logger
            .log("debug", LOG_ID + "(markMessageAsRead) _entering_");
        if (this.useXMPP) {
            let stanzaRead = xml("message", {
                "to": message.fromJid,
                //"from": message.toJid + "ERROR",
                "type": TYPE_CHAT
            }, xml("received", {
                "xmlns": NameSpacesLabels.ReceiptsNameSpace,
                "event": "read",
                "entity": "client",
                "id": message.id
            }));

            this
                .logger
                .log("info", LOG_ID + "(markMessageAsRead) send - 'message'", stanzaRead.root().toString());
            this
                .logger
                .log("debug", LOG_ID + "(markMessageAsRead) _exiting_");
            return new Promise((resolve, reject) => {
                that
                    .xmppClient
                    .send(stanzaRead).then(() => {
                    that.logger.log("debug", LOG_ID + "(markMessageAsRead) sent");
                    resolve();
                }).catch((err) => {
                    that.logger.log("error", LOG_ID + "(markMessageAsRead) error : ", err);
                    reject(err);
                });
            });
        }

        that
            .logger
            .log("warn", LOG_ID + "(markMessageAsRead) No XMPP connection...");
        that
            .logger
            .log("debug", LOG_ID + "(markMessageAsRead) _exiting_");
        return Promise.resolve(null);
    }

    sendChatExistingFSMessage(message, jid, lang, fileDescriptor) {
        let that = this;
        that
            .logger
            .log("debug", LOG_ID + "(sendChatExistingFSMessage) _entering_");
        if (that.useXMPP) {
            let id = that.xmppUtils.getUniqueMessageId();

            // Remove resource if exists
            jid = that.xmppUtils.getBareJIDFromFullJID(jid);

            let url = this.host + "/api/rainbow/fileserver/v1.0/files/" + fileDescriptor.id;

            let stanza = xml("message", {
                   // "from": this.fullJid,
                    "to": jid,
                    "xmlns": NameSpacesLabels.ClientNameSpace,
                    "type": TYPE_CHAT,
                    "id": id
                }, xml("body", {
                    "xml:lang": lang
                }, message), xml("request", {
                    "xmlns": NameSpacesLabels.ReceiptsNameSpace
                }, xml("active", {
                    "xmlns": NameSpacesLabels.ChatestatesNameSpace
                })
                ), xml("x", {
                    "xmlns": NameSpacesLabels.OobNameSpace
                }, xml("url", {}, url)
                , xml("mime", {}, fileDescriptor.typeMIME)
                , xml("filename", {}, fileDescriptor.fileName)
                , xml("size", {}, fileDescriptor.size)
                )
                , xml("store", {
                    "xmlns": NameSpacesLabels.HintsNameSpace
                })
            );

            that
                .logger
                .log("info", LOG_ID + "(sendChatExistingFSMessage) send - 'message'", stanza.toString());
            that
                .logger
                .log("debug", LOG_ID + "(sendChatExistingFSMessage) _exiting_");
            return new Promise((resolve, reject) => {
                that
                    .xmppClient
                    .send(stanza).then(() => {
                    that.logger.log("debug", LOG_ID + "(sendChatExistingFSMessage) sent");
                    resolve({from: this.jid_im, to: jid, type: "chat", id: id, date: new Date(), content: message});
                }).catch((err) => {
                    reject(err);
                });
            });
        }

        that
            .logger
            .log("warn", LOG_ID + "(sendChatExistingFSMessage) No XMPP connection...");
        that
            .logger
            .log("debug", LOG_ID + "(sendChatExistingFSMessage) _exiting_");
        return Promise.resolve(null);
    }

    sendChatExistingFSMessageToBubble(message, jid, lang, fileDescriptor) {
        let that = this;
        that
            .logger
            .log("debug", LOG_ID + "(sendChatExistingFSMessageToBubble) _entering_");
        if (that.useXMPP) {
            let id = that.xmppUtils.getUniqueMessageId();

            // Remove resource if exists
            jid = that.xmppUtils.getBareJIDFromFullJID(jid);

            let url = this.host + "/api/rainbow/fileserver/v1.0/files/" + fileDescriptor.id;

            let stanza = xml("message", {
                    //"from": this.fullJid,
                    "to": jid,
                    "xmlns": NameSpacesLabels.ClientNameSpace,
                    "type": TYPE_GROUPCHAT,
                    "id": id
                }, xml("body", {
                    "xml:lang": lang
                }, message), xml("request", {
                    "xmlns": NameSpacesLabels.ReceiptsNameSpace
                }, xml("active", {
                    "xmlns": NameSpacesLabels.ChatestatesNameSpace
                })
                ), xml("x", {
                    "xmlns": NameSpacesLabels.OobNameSpace
                }, xml("url", {}, url)
                , xml("mime", {}, fileDescriptor.typeMIME)
                , xml("filename", {}, fileDescriptor.fileName)
                , xml("size", {}, fileDescriptor.size)
                )
                , xml("store", {
                    "xmlns": NameSpacesLabels.HintsNameSpace
                })
            );

            that
                .logger
                .log("info", LOG_ID + "(sendChatExistingFSMessageToBubble) send - 'message'", stanza.toString());
            that
                .logger
                .log("debug", LOG_ID + "(sendChatExistingFSMessageToBubble) _exiting_");
            return new Promise((resolve, reject) => {
                that
                    .xmppClient
                    .send(stanza).then(() => {
                    that.logger.log("debug", LOG_ID + "(sendChatExistingFSMessageToBubble) sent");
                    resolve({from: this.jid_im, to: jid, type: "chat", id: id, date: new Date(), content: message});
                }).catch((err) => {
                    reject(err);
                });
            });
        }

        that
            .logger
            .log("warn", LOG_ID + "(sendChatExistingFSMessageToBubble) No XMPP connection...");
        that
            .logger
            .log("debug", LOG_ID + "(sendChatExistingFSMessageToBubble) _exiting_");
        return Promise.resolve(null);
    }

    sendIsTypingState(conversation, isTypingState) {
        let that = this;
        this
            .logger
            .log("debug", LOG_ID + "(sendIsTypingState) _entering_");

        let state = (isTypingState) ? "composing" : "active";

        if (this.useXMPP) {

            let jid = conversation.id;
            let type = "chat";

            // Handle One to one conversation message
            if (conversation.type === Conversation.Type.ONE_TO_ONE) {
                //jid = this.contact.jid;
                type = "chat";
            }
            // Handle Room conversation message
            else {
                type = "groupchat";
            }

            let stanzaRead = xml("message", {
                "to": jid,
                "type": type,
                "id": that.xmppUtils.getUniqueMessageId()
            }, xml(state, {
                "xmlns": NameSpacesLabels.ChatestatesNameSpace
            }));

            this
                .logger
                .log("info", LOG_ID + "(sendIsTypingState) send - 'message'", stanzaRead.root().toString());
            this
                .logger
                .log("debug", LOG_ID + "(sendIsTypingState) _exiting_");
            return new Promise((resolve, reject) => {
                that
                    .xmppClient
                    .send(stanzaRead).then(() => {
                    that.logger.log("debug", LOG_ID + "(sendIsTypingState) sent");
                    resolve();
                }).catch((err) => {
                    reject(err);
                });
            });
        }

        that
            .logger
            .log("warn", LOG_ID + "(markMessageAsRead) No XMPP connection...");
        that
            .logger
            .log("debug", LOG_ID + "(markMessageAsRead) _exiting_");
        return Promise.resolve(null);
    }

    getRosters() {
        let that = this;
        this
            .logger
            .log("debug", LOG_ID + "(start) getRosters");
        if (this.useXMPP) {
            let stanza = xml("iq", {
                "id": that.xmppUtils.getUniqueMessageId(),
                "type": "get"
            }, xml("query", {xmlns: NameSpacesLabels.RosterNameSpace}));

            this
                .logger
                .log("info", LOG_ID + "(getRosters) send - 'iq/rosters'", stanza.toString());
            this
                .xmppClient
                .send(stanza);
        } else {
            this
                .logger
                .log("warn", LOG_ID + "(getRosters) No XMPP connection...");
        }
        this
            .logger
            .log("debug", LOG_ID + "(getRosters) _exiting_");
    }

    /****************************************************/
    /**            XMPP ROSTER MANAGEMENT              **/
    /****************************************************/
    async sendSubscription (contact) {
        let that = this;
        // Return immediately if already subscribed
        if (contact.subscribe === "to" || contact.subscribe === "both") {
            return ;
        }

        // Send subscriptions for im and telephony presences
        await that.sendSubscribeInvitation(contact.jid);
        await that.sendSubscribeInvitation(contact.jidtel);

        return ;
    };

    async sendSubscribeInvitation (jid) {
        let that = this;
        this.logger.log("debug", LOG_ID + "(sendSubscribeInvitation) Send subscribe invitation to ", jid);
        let stanza = xml("iq", {
            type: "get",
            to: that.jid_tel + "/phone",
            xmlns: NameSpacesLabels.ClientNameSpace,
            "id": that.xmppUtils.getUniqueMessageId()
        }, xml("pbxagentstatus", {"xmlns": NameSpacesLabels.Monitoring1NameSpace}));

        this.logger.log("info", LOG_ID + "(getAgentStatus) send - 'iq get'", stanza.root().toString());
        return this.xmppClient.sendIq(stanza);
    };

    sendInitialBubblePresence(jid) {
        let that = this;
        this
            .logger
            .log("debug", LOG_ID + "(sendInitialBubblePresence) _entering_");
        let id = that.xmppUtils.getUniqueMessageId();

        if (this.useXMPP) {
            let stanza = xml("presence", {
                "id": id,
                to: jid + "/" + this.fullJid
            }, xml("x", {"xmlns": NameSpacesLabels.MucNameSpace}), xml("history", {maxchars: "0"}));

            if (this.initialPresence) {
                this.initialPresence = false;
                stanza.append(xml("application",
                    {xmlns: NameSpacesLabels.ApplicationNameSpace},
                    xml("appid", {}, this.applicationId),
                    xml("userid", {}, this.userId)));
                stanza.append(xml("priority", {}, "5"));
            }

            this
                .logger
                .log("info", LOG_ID + "(sendInitialBubblePresence) send - 'message'", stanza.root().toString());
            this
                .logger
                .log("debug", LOG_ID + "(sendInitialBubblePresence) _exiting_");
            return this
                .xmppClient
                .send(stanza);
        } else {
            this
                .logger
                .log("warn", LOG_ID + "(sendInitialBubblePresence) No XMPP connection...");
            return Promise.resolve();
        }
    }

    sendUnavailableBubblePresence(jid) {
        let that = this;
        this
            .logger
            .log("debug", LOG_ID + "(sendUnavailableBubblePresence) _entering_");
        if (this.useXMPP) {
            let id = that.xmppUtils.getUniqueMessageId();

            let stanza = xml("presence", {
                "id": id,
                to: jid + "/" + this.fullJid,
                type: "unavailable"
            }, xml("x", {"xmlns": NameSpacesLabels.MucNameSpace}));

            this
                .logger
                .log("info", LOG_ID + "(sendUnavailableBubblePresence) send - 'message'", stanza.root().toString());
            this
                .xmppClient
                .send(stanza);
        } else {
            this
                .logger
                .log("warn", LOG_ID + "(sendUnavailableBubblePresence) No XMPP connection...");
        }
        this
            .logger
            .log("debug", LOG_ID + "(sendUnavailableBubblePresence) _exiting_");
    }

    getAgentStatus() {
        let that = this;
        return new Promise((resolve, reject) => {
            this.logger.log("debug", LOG_ID + "(getAgentStatus) _entering_");

            let stanza = xml("iq", {
                type: "get",
                to: that.jid_tel + "/phone",
                xmlns: NameSpacesLabels.ClientNameSpace,
                "id": that.xmppUtils.getUniqueMessageId()
            }, xml("pbxagentstatus", {"xmlns": NameSpacesLabels.Monitoring1NameSpace}));

            this.logger.log("info", LOG_ID + "(getAgentStatus) send - 'iq get'", stanza.root().toString());
            this.xmppClient.sendIq(stanza).then((data) => {
                let pbxagentstatus = {
                    "phoneapi": "",
                    "xmppagent": "",
                    "version": ""
                };
                let agentStatus = {"phoneApi": "", "xmppAgent": "", "agentVersion": ""};

                let subchildren = data.children[0].children;
                subchildren.forEach((item) => {
                    if (typeof item === "object") {
                        let itemName = item.getName();
                        if (itemName) {
                            pbxagentstatus[itemName] = item.text();
                        }
                    }
                });

                if (pbxagentstatus.version) {
                    let phoneApi = pbxagentstatus.phoneapi;
                    let xmppAgent = pbxagentstatus.xmppagent;
                    let agentVersion = pbxagentstatus.version;
                    agentStatus = {"phoneApi": phoneApi, "xmppAgent": xmppAgent, "agentVersion": agentVersion};
                }
                resolve(agentStatus);
            });

            this.logger.log("debug", LOG_ID + "(getAgentStatus) _exiting_");
        });
    }

    /**
     *
      * @param useAfter
     * @returns {Promise<void>}
     */
    async sendGetCallLogHistoryPage(useAfter) {
        /*
        <iq from="38db98d2907a4c4095742a237b84557c@vberder-all-in-one-dev-1.opentouch.cloud" id="c08a506f-83d9-48a8-8628-10d69a44c340:sendIQ" type="set" xmlns="jabber:client">
            <query xmlns="jabber:iq:telephony:call_log">
                <set xmlns="http://jabber.org/protocol/rsm">
                    <max>75</max>
                    <before></before>
                </set>
            </query>
        </iq>
         */
        let that = this;
        // Get the user contact
        let useMax = 75;
        let useBefore = ""; //add empty before in order to get the most recent messages
        //let useAfter;

        let stanza =  xml("iq", {
            "from": this.jid_im,
            "type": "set",
            "id": that.xmppUtils.getUniqueMessageId()
        });
        let queryEmt = xml("query", {
            xmlns: NameSpacesLabels.CallLogNamespace
        });

        if (useMax || useBefore || useAfter) {
            let rsmSet = xml("set", {xmlns: NameSpacesLabels.RsmNameSpace});
            if (useMax) {
                rsmSet.append(xml("max", {}, useMax));
            }

            if (useAfter) {
                rsmSet.append(xml("after", {}, useAfter));
            } else {
                rsmSet.append(xml("before", {}, useBefore));
            }
            queryEmt.append(rsmSet);
        }
        stanza.append(queryEmt);

        return await this.xmppClient.sendIq(stanza);
    }

    async deleteOneCallLog(id) {
        let that = this;

        that.logger.log("info", LOG_ID + "[deleteOneCallLog] deleteOneCallLog " + id);
        // Get the user contact
        //let userContact = contactService.userContact;

        let message = xml("iq", {
            "from": this.jid_im,
            "to": this.jid_im,
            "type": "set",
            "id": that.xmppUtils.getUniqueMessageId()
        });

        let msg = message.append(xml("delete", {xmlns: NameSpacesLabels.CallLogNamespace, call_id: id}));

        return await this.xmppClient.sendIq(msg);
    }

    async deleteCallLogsForContact(jid) {
        let that = this;

        that.logger.log("info", LOG_ID + "[deleteCallLogsForContact] deleteCallLogsForContact " + jid);
        // Get the user contact
        //let userContact = contactService.userContact;

        let message = xml("iq", {
            "from": that.jid_im,
            "to": that.jid_im,
            "type": "set",
            "id": that.xmppUtils.getUniqueMessageId()
        });

        let msg = message.append(xml("delete", {xmlns: NameSpacesLabels.CallLogNamespace, peer: jid}));
        return await this.xmppClient.sendIq(msg);
        //xmppService.sendIQ(msg);
    }

    async deleteAllCallLogs() {
        let that = this;

        that.logger.log("info", LOG_ID + "[deleteAllCallLogs] deleteAllCallLogs");
        // Get the user contact
        //let userContact = contactService.userContact;

        let message = xml("iq", {
            "from": that.jid_im,
            "to": that.jid_im,
            "type": "set",
            "id": that.xmppUtils.getUniqueMessageId()
        });

        let msg = message.append(xml("delete", {xmlns: NameSpacesLabels.CallLogNamespace}));
        return await this.xmppClient.sendIq(msg);
        //xmppService.sendIQ(msg);
    }

    async markCallLogAsRead(id) {
        let that = this;

        that.logger.log("info", LOG_ID + "[markCallLogAsRead] markCallLogAsRead " + id);
        // Get the user contact
        //let userContact = contactService.userContact;

        let message = xml("message", {
            "from": that.jid_im,
            "to": that.jid_im,
            "id": that.xmppUtils.getUniqueMessageId()
        });

        let msg = message.append(xml("read", {xmlns: NameSpacesLabels.CallLogAckNamespace, call_id: id}));

        return await this.xmppClient.sendIq(msg);
        //xmppService.sendIQ(msg);
    }

    async markAllCallsLogsAsRead(callLogs) {
        let that = this;

        that.logger.log("info", LOG_ID + "[markAllCallsLogsAsRead] markAllCallsLogsAsRead ");

        //let userContact = contactService.userContact;
        let promSend = [];

        for (let i = 0; i < callLogs.length; i++) {
            if (!callLogs[i].read) {

                let message = xml("message", {
                    "from": that.jid_im,
                    "to": that.jid_im,
                    "id": that.xmppUtils.getUniqueMessageId()
                });

                let msg = message.append(xml("read", {
                    "xmlns": NameSpacesLabels.CallLogAckNamespace,
                    "call_id": callLogs[i].id
                }));

                promSend.push(that.xmppClient.sendIq(msg));
                //xmppService.sendIQ(msg);
            }
        }
        return await Promise.all(promSend);
    }

    getErrorMessage (data, actionLabel) {
        let errorMessage = actionLabel + " failure : ";

        if (data.attr("type") === "error") {
            //let errorMsg = stanza.getChild("error")?stanza.getChild("error").getChild("text").getText() ||  "" : "";

            let error = data.getChild("error");
            if (error) {
                let errorType = error.attr("type");
                let errorCode = error.attr("code");
                if (errorType) {
                    errorMessage += (errorType + " : ");

                    if (errorType === "modify") {
                        errorMessage += error.getChild("text").getText() ||  "";
                    }
                }
                if (errorCode) {
                    if (errorCode === "503") {
                        errorMessage += "Agent error : service unavailable";
                    }
                }

                this.logger.log("debug", LOG_ID + "[getErrorMessage] " + errorMessage);

            }
            else {
                errorMessage += "Unknown error";
            }

            return errorMessage;
        }
        return null;
    }

    getTelephonyState (secondary) {
        let that =this;
        return new Promise((resolve, reject) => {
            this.logger.log("debug", LOG_ID + "(getTelephonyState) _entering_");

            let stanza;
// <iq type='get' to='tel_38db98d2907a4c4095742a237b84557c@vberder-all-in-one-dev-1.opentouch.cloud/phone' xmlns='jabber:client' id='11b8b163-f317-42fd-9962-f1943d5adb21:sendIQ'>
// <callservice xmlns='urn:xmpp:pbxagent:callservice:1'>
// <connections/>
// </callservice>
// </iq>
            if (!secondary) {
                //iq = $iq({type: "get", to: service.userJidTel + "/phone"})
                    //.c("callservice", {xmlns: CALLSERVICE_NS})
                    //.c("connections");

                stanza = xml("iq", {
                    type: "get",
                    to: that.jid_tel + "/phone",
                    xmlns: NameSpacesLabels.ClientNameSpace,
                    "id": that.xmppUtils.getUniqueMessageId()
                }, xml("callservice", {"xmlns":  NameSpacesLabels.CallService1NameSpace}, xml("connections")));

            } else {
                stanza = xml("iq", {
                    type: "get",
                    to: that.jid_tel + "/phone",
                    //xmlns: NameSpacesLabels.ClientNameSpace,
                    "id": that.xmppUtils.getUniqueMessageId()
                }, xml("callservice", {"xmlns":  NameSpacesLabels.CallService1NameSpace}, xml("connections", {deviceType: "SECONDARY"})));
            }

                this.logger.log("info", LOG_ID + "(getTelephonyState) send - 'iq get'", stanza.root().toString());
            this.xmppClient.sendIq(stanza).then((data)=> {
                this.logger.log("info", LOG_ID + "(getTelephonyState) received - 'iq result'", data);


                // Handle eventual error message
                let errorMessage = that.getErrorMessage(data, "getTelephonyState");
                if (errorMessage) {
                    this.logger.log("debug", LOG_ID + "getTelephonyState -- failure -- " + errorMessage);
                    reject(new Error(errorMessage));
                    return;
                }

                // Handle existing calls
                let existingCalls = that.xmppUtils.findChild(data, "connections");
                let children = {};
                if (existingCalls.children.length === 0) {
                    this.logger.log("debug", LOG_ID + "getTelephonyState -- success -- no existing call");
                } else {
                    children = existingCalls.children;
                }
                resolve(children);

            });

            this.logger.log("debug", LOG_ID + "(getAgentStatus) _exiting_");
        });
    }

    sendPing() {
        let that = this;
        this
        .logger
        .log("debug", LOG_ID + "(sendPing) _entering_");
        if (this.useXMPP) {
            let id = that.xmppUtils.getUniqueMessageId();
            let stanza = xml("iq", {
                "type": "get",
                "id": id
            }, xml("ping", {xmlns: NameSpacesLabels.PingNameSpace}));

            this
                .logger
                .log("info", LOG_ID + "(sendPing) send - 'message'", stanza.root().toString(), " for Rainbow Node SDK version : ", packageVersion.version );
            this.xmppClient.send(stanza).catch((error) => {
                this.logger.log("debug", LOG_ID + "(sendPing) error : ", error);
            });
        } else {
            this.logger.log("warn", LOG_ID + "(sendPing) No XMPP connection...");
        }
        this.logger.log("debug", LOG_ID + "(sendPing) _exiting_");
    }

    // Mam
    mamQuery( jid, options) {
        let that = this;

        const MAM = "urn:xmpp:mam:1";
        const _p =  [ "with", "start", "end" ];

        let mamAttr = {xmlns: MAM, queryid: null};
        if (!!options.queryid) {
            mamAttr.queryid = options.queryid;
            delete options.queryid;
        }

        let onMessage = options.onMessage;
        delete options.onMessage;
        let onComplete = options.onComplete;
        delete options.onComplete;

        let stanza = xml("iq", {
            "type": "set",
            id: jid,
            xmlns: NameSpacesLabels.ClientNameSpace
        }, xml("query", mamAttr, xml("x", {
            xmlns: NameSpacesLabels.DataNameSpace,
            type: "submit"
        }, xml("field", {
                "var": "FORM_TYPE",
                "type": "hidden"
            }, xml("value", {}, MAM)), _p.filter( (key) => options[key]).map((key) => {
                    let value = xml("field", {
                        "var": key
                    }, xml("value", {}, options[key]));
                    delete options[key];
                    return value;
            })),
            xml("set", { xmlns:NameSpacesLabels.RsmNameSpace }, Object.keys(options).map((key)=> xml( key, {}, options[key] /*? options[key] : null*/)))
        ));

        that.logger.log("info", LOG_ID + "(handleXMPPConnection) mamQuery - 'stanza'");
        that.logger.log("internal", LOG_ID + "(handleXMPPConnection) mamQuery - 'stanza'", stanza.toString());
        that.xmppClient.send(stanza).then(() => {
            if ( typeof onComplete === "function" ) {
                onComplete();
            }
       });
    }

    mamQueryMuc(jid, to, options) {
        let that = this;
        const MAM = "urn:xmpp:mam:1";
        const _p =  [ "with", "start", "end" ];

        let mamAttr = {xmlns: MAM, queryid: null};
        if (Boolean(options.queryid)) {
            mamAttr.queryid = options.queryid;
            delete options.queryid;
        }

        let onMessage = options.onMessage;
        delete options.onMessage;
        let onComplete = options.onComplete;
        delete options.onComplete;

        let stanza = xml("iq", {
            "type": "set",
            id: jid,
            to: to,
            xmlns: NameSpacesLabels.ClientNameSpace
        }, xml("query", mamAttr, xml("x", {
            xmlns: NameSpacesLabels.DataNameSpace,
            type: "submit"
        }, xml("field", {
                "var": "FORM_TYPE",
                "type": "hidden"
            }, xml("value", {}, MAM)), _p.filter( (key) => options[key]).map((key) => {
                    let value = xml("field", {
                        "var": key
                    }, xml("value", {}, options[key]));
                    delete options[key];
                    return value;
            })),
            xml("set", { xmlns:NameSpacesLabels.RsmNameSpace }, Object.keys(options).map((key)=> xml( key, {}, options[key] ? options[key] : null)))
        ));

        that.logger.log("info", LOG_ID + "(handleXMPPConnection) mamQueryMuc - 'stanza'");
        that.logger.log("internal", LOG_ID + "(handleXMPPConnection) mamQueryMuc - 'stanza'", stanza.toString());
        that.xmppClient.send(stanza).then(() => {
            if ( typeof onComplete === "function" ) {
                onComplete();
            }
        });
    }

    mamDelete(options) {

        let that = this;
        const MAM = "urn:xmpp:mam:1";
        const _p =  [ "with", "start", "end" ];

        let mamAttr = {xmlns: MAM, deleteid: null};
        if (Boolean(options.deleteid)) {
            mamAttr.deleteid = options.deleteid;
            delete options.deleteid;
        }

        let onMessage = options.onMessage;
        delete options.onMessage;
        let onComplete = options.onComplete;
        delete options.onComplete;

        options.queryid = that.xmppUtils.getUniqueMessageId();

        let id = that.xmppUtils.getUniqueMessageId();

        let stanza = xml("iq", {
            "type": "set",
            id: id,
            xmlns: NameSpacesLabels.ClientNameSpace
        }, xml("delete", mamAttr, xml("x", {
            xmlns: NameSpacesLabels.DataNameSpace,
            type: "submit"
        }, xml("field", {
            "var": "FORM_TYPE",
            "type": "hidden"
        }, xml("value", {}, MAM)), _p.filter( (key) => options[key]).map((key) => {
            let value = xml("field", {
                "var": key
            }, xml("value", {}, options[key]));
            delete options[key];
            return value;
            })),
            xml("set", { xmlns:NameSpacesLabels.RsmNameSpace }, Object.keys(options).map((key)=> xml( key, {}, options[key] ? options[key] : null)))
        ));

        that.logger.log("info", LOG_ID + "(handleXMPPConnection) mamDelete - 'stanza'");
        that.logger.log("internal", LOG_ID + "(handleXMPPConnection) mamDelete - 'stanza'", stanza.toString());
        that.xmppClient.send(stanza).then((result) => {
             if ( typeof onComplete === "function" ) {
                 onComplete(result);
             }
        });
    }

    // Voice Messages
    voiceMessageQuery(jid) {
        let that = this;

        /*
                    // Create the iq request
            let iq = $iq({type: "get", to: that.userJidTel + "/phone"})
                .c("callservice", {xmlns: NameSpacesLabels.CallService1NameSpace})
                .c("messaging");
         */

        let nsAttr = {xmlns: NameSpacesLabels.CallService1NameSpace};

        let stanza = xml("iq", {
            "type": "set",
            "to": jid + "/phone"
        }, xml("callservice", nsAttr,
            xml("messaging"))
        );

        return new Promise((resolve,reject) => {
            that.logger.log("info", LOG_ID + "(handleXMPPConnection) voiceMessageQuery - 'stanza'");
            that.logger.log("internal", LOG_ID + "(handleXMPPConnection) voiceMessageQuery - 'stanza'", stanza.toString());
            that.xmppClient.send(stanza).then((data) => {
                resolve(data);
            }).catch((err) => {
                reject(err);
            });
        });
    }


}

export { XMPPService };
module.exports.XMPPService = XMPPService;

