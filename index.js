'use strict';

var Core = require('./lib/Core');

const EventEmitter = require('events').EventEmitter;

var signinAndRenewToken;

class NodeSDK {

    constructor(options) {
        // private
        var that = this;
        this._evEmitter = new EventEmitter();
        this._core = new Core(options, this._evEmitter);

        /**
         * Public API
         * @public
         * @param {Object} events The events manager (Node.js EventEmitter)
         * @description
         *  Use this param to subscribe to events coming from the SDK
         * 
         */
        this.events = new EventEmitter();

        this._evEmitter.on('rainbow_signinrequired', function() {
            signinAndRenewToken(true);
        });

        this._evEmitter.on('rainbow_xmppconnected', function() {
            that.events.emit('rainbow_onconnectionok');
            return(that._core.contacts.getRosters())
            .then(function() {
                return that._core.presence.sendInitialPresence();  
            }).then(function() {
                return that._core.im.enableCarbon();
            }).then(function() {
                that.events.emit('rainbow_onready');
            });
        });

        this._evEmitter.on('rainbow_onmessagereceived', function(json) {
            that.events.emit('rainbow_onmessagereceived', json);
        });

        this._evEmitter.on('rainbow_onxmpperror', function(err) {
            that.events.emit('rainbow_onerror', err);
        });

        this._evEmitter.on('rainbow_onnocredentials', function() {
            that.events.emit('rainbow_onerror', null);
        });

        this._evEmitter.on('rainbow.onrosterpresencechanged', function(contact) {
            that.events.emit('rainbow_oncontactpresencechanged', contact);
        });

        this._evEmitter.on('rainbow_onreceipt', function(receipt) {
            if(receipt.entity === 'server') {
                that.events.emit('rainbow_onmessageserverreceiptreceived', receipt);
            }
            else {
                if(receipt.event === "received") {
                    that.events.emit('rainbow_onmessagereceiptreceived', receipt);
                }
                else {
                    that.events.emit('rainbow_onmessagereceiptreadreceived', receipt);
                }
            }
        });

        signinAndRenewToken = (forceStopXMPP) => { 
            that._core.signin(forceStopXMPP).then(function() {
                that._core.tokenSurvey();
            }).catch(function(err) {
                that.events.emit('rainbow_onconnectionerror', err);
            });
        };
    }

    /**
     * @public
     * @method start
     * @description
     *    Start the SDK
     */
    start() {
        this._core.start().then(function() {
            signinAndRenewToken(false);
        }).catch(function(err) {
             that.events.emit('rainbow_onstartconnectionerror', err);
        });
    }

    /**
     * @public
     * @method stop
     * @description
     *    Stop the SDK
     */
    stop() {

    }

    /**
     * @public
     * @property im
     * @description
     *    Get access to the IM service
     */
    get im() {
        return this._core.im;
    }

    /**
     * @public
     * @property contacts
     * @description
     *    Get access to the Contacts service
     */
    get contacts() {
        return this._core.contacts;
    }


}

module.exports = NodeSDK;