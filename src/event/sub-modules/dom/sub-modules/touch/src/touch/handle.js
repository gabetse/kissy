/**
 * @ignore
 * base handle for touch gesture, mouse and touch normalization
 * @author yiminghe@gmail.com
 */
KISSY.add('event/dom/touch/handle', function (S, Dom, eventHandleMap, DomEvent) {
    var key = S.guid('touch-handle'),
        Features = S.Features,
        gestureStartEvent,
        gestureMoveEvent,
        gestureEndEvent;

    function isTouchEvent(e) {
        return S.startsWith(e.type, 'touch');
    }

    function isMouseEvent(e) {
        return S.startsWith(e.type, 'mouse');
    }

    // This should be long enough to ignore compatible mouse events made by touch
    var DUP_TIMEOUT = 2500;
    // radius around touchend that swallows mouse events
    var DUP_DIST = 25;

    if (Features.isTouchEventSupported()) {
        gestureEndEvent = 'touchend touchcancel mouseup';
        // allow touch and mouse both!
        gestureStartEvent = 'touchstart mousedown';
        gestureMoveEvent = 'touchmove mousemove';
        if(S.UA.ios){
            // ios mousedown is buggy
            gestureEndEvent = 'touchend touchcancel';
            gestureStartEvent = 'touchstart';
            gestureMoveEvent = 'touchmove';
        }
    } else if (Features.isMsPointerSupported()) {
        gestureStartEvent = 'MSPointerDown';
        gestureMoveEvent = 'MSPointerMove';
        gestureEndEvent = 'MSPointerUp MSPointerCancel';
    } else {
        gestureStartEvent = 'mousedown';
        gestureMoveEvent = 'mousemove';
        gestureEndEvent = 'mouseup';
    }

    function DocumentHandler(doc) {
        var self = this;
        self.doc = doc;
        self.eventHandle = {};
        self.init();
        // normalize pointer event to touch event
        self.touches = [];
        // touches length of touch event
        self.inTouch = 0;
    }

    DocumentHandler.prototype = {
        lastTouches: [],

        firstTouch: null,

        init: function () {
            var self = this,
                doc = self.doc;
            DomEvent.on(doc, gestureStartEvent, self.onTouchStart, self);
            DomEvent.on(doc, gestureMoveEvent, self.onTouchMove, self);
            DomEvent.on(doc, gestureEndEvent, self.onTouchEnd, self);
        },

        isPrimaryTouch: function (inTouch) {
            return this.firstTouch === inTouch.identifier;
        },
        setPrimaryTouch: function (inTouch) {
            if (this.firstTouch === null) {
                this.firstTouch = inTouch.identifier;
            }
        },
        removePrimaryTouch: function (inTouch) {
            if (this.isPrimaryTouch(inTouch)) {
                this.firstTouch = null;
            }
        },

        // prevent mouse events from creating pointer events
        dupMouse: function (inEvent) {
            var lts = this.lastTouches;
            var t = inEvent.changedTouches[0];
            // only the primary finger will dup mouse events
            if (this.isPrimaryTouch(t)) {
                // remember x/y of last touch
                var lt = {x: t.clientX, y: t.clientY};
                lts.push(lt);
                var fn = (function (lts, lt) {
                    var i = lts.indexOf(lt);
                    if (i > -1) {
                        lts.splice(i, 1);
                    }
                }).bind(null, lts, lt);
                setTimeout(fn, DUP_TIMEOUT);
            }
        },

        // collide with the touch event
        isEventSimulatedFromTouch: function (inEvent) {
            var lts = this.lastTouches;
            var x = inEvent.clientX,
                y = inEvent.clientY;
            for (var i = 0, l = lts.length, t; i < l && (t = lts[i]); i++) {
                // simulated mouse events will be swallowed near a primary touchend
                var dx = Math.abs(x - t.x),
                    dy = Math.abs(y - t.y);
                if (dx <= DUP_DIST && dy <= DUP_DIST) {
                    return true;
                }
            }
            return 0;
        },

        constructor: DocumentHandler,

        normalize: function (e) {
            var type = e.type,
                notUp,
                touchList;
            if (isTouchEvent(e)) {
                touchList = (type == 'touchend' || type == 'touchcancel') ?
                    e.changedTouches :
                    e.touches;
                if (touchList.length == 1) {
                    e.which = 1;
                    e.pageX = touchList[0].pageX;
                    e.pageY = touchList[0].pageY;
                }
                return e;
            } else {
                touchList = this.touches;
            }
            notUp = !type.match(/(up|cancel)$/i);
            e.touches = notUp ? touchList : [];
            e.targetTouches = notUp ? touchList : [];
            e.changedTouches = touchList;
            return e;
        },

        onTouchStart: function (event) {
            var e, h,
                self = this,
                eventHandle = self.eventHandle;
            if (isTouchEvent(event)) {
                self.setPrimaryTouch(event.changedTouches[0]);
                self.dupMouse(event);
            } else if (isMouseEvent(event)) {
                if (self.isEventSimulatedFromTouch(event)) {
                    return;
                }
            }
            for (e in eventHandle) {
                h = eventHandle[e].handle;
                h.isActive = 1;
            }
            if (isTouchEvent(event)) {
                self.touches = S.makeArray(event.touches);
            } else {
                self.touches = [event.originalEvent];
            }
            // if preventDefault, will not trigger click event
            self.callEventHandle('onTouchStart', event);
        },

        onTouchMove: function (e) {
            var self = this;
            if (isMouseEvent(e)) {
                if (this.isEventSimulatedFromTouch(e)) {
                    return;
                }
            }
            self.touches = [e.originalEvent];
            // no throttle! to allow preventDefault
            self.callEventHandle('onTouchMove', e);
        },

        onTouchEnd: function (event) {
            var self = this;
            if (isMouseEvent(event)) {
                if (self.isEventSimulatedFromTouch(event)) {
                    return;
                }
            }
            self.callEventHandle('onTouchEnd', event);
            if (isTouchEvent(event)) {
                self.touches = S.makeArray(event.touches);
                self.dupMouse(event);
                S.makeArray(event.changedTouches).forEach(function (touch) {
                    self.removePrimaryTouch(touch);
                });
            } else {
                self.touches = [];
            }
        },

        callEventHandle: function (method, event) {
            var self = this,
                eventHandle = self.eventHandle,
                e,
                h;
            event = self.normalize(event);
            for (e in eventHandle) {
                // event processor shared by multiple events
                h = eventHandle[e].handle;
                if (h.processed) {
                    continue;
                }
                h.processed = 1;
                //type=event.type;
                if (h.isActive && h[method] && h[method](event) === false) {
                    h.isActive = 0;
                }
                //event.type=type;
            }
            for (e in eventHandle) {
                h = eventHandle[e].handle;
                h.processed = 0;
            }
        },

        addEventHandle: function (event) {
            var self = this,
                eventHandle = self.eventHandle,
                handle = eventHandleMap[event].handle;
            if (eventHandle[event]) {
                eventHandle[event].count++;
            } else {
                eventHandle[event] = {
                    count: 1,
                    handle: handle
                };
            }
        },

        'removeEventHandle': function (event) {
            var eventHandle = this.eventHandle;
            if (eventHandle[event]) {
                eventHandle[event].count--;
                if (!eventHandle[event].count) {
                    delete eventHandle[event];
                }
            }
        },

        destroy: function () {
            var self = this,
                doc = self.doc;
            DomEvent.detach(doc, gestureStartEvent, self.onTouchStart, self);
            DomEvent.detach(doc, gestureMoveEvent, self.onTouchMove, self);
            DomEvent.detach(doc, gestureEndEvent, self.onTouchEnd, self);
        }
    };

    return {
        addDocumentHandle: function (el, event) {
            var doc = Dom.getDocument(el),
                handle = Dom.data(doc, key);
            if (!handle) {
                Dom.data(doc, key, handle = new DocumentHandler(doc));
            }
            if (event) {
                handle.addEventHandle(event);
            }
        },

        removeDocumentHandle: function (el, event) {
            var doc = Dom.getDocument(el),
                handle = Dom.data(doc, key);
            if (handle) {
                if (event) {
                    handle.removeEventHandle(event);
                }
                if (S.isEmptyObject(handle.eventHandle)) {
                    handle.destroy();
                    Dom.removeData(doc, key);
                }
            }
        }
    };
}, {
    requires: [
        'dom',
        './handle-map',
        'event/dom/base',
        './tap',
        './swipe',
        './double-tap',
        './pinch',
        './tap-hold',
        './rotate'
    ]
});
/**
 2013-08-29 yiminghe@gmail.com
 - ios bug
 create new element on touchend handler
 then a mousedown event will be fired on the new element
 - refer: https://github.com/Polymer/PointerEvents/

 2013-08-28 yiminghe@gmail.com
 - chrome android bug: first series touchstart is not fired!
 - chrome android bug when bind mousedown and touch together to ordinary div
 chrome pc ：
 touchstart mousedown touchend
 chrome android ：
 touchstart touchend mousedown
 safari no mousedown
 - https://code.google.com/p/chromium/issues/detail?id=280516
 - https://code.google.com/p/chromium/issues/detail?id=280507

 2013-07-23 yiminghe@gmail.com
 - bind both mouse and touch for start
 - but bind mousemove or touchmove for move

 2012 yiminghe@gmail.com
 in order to make tap/doubleTap bubbling same with native event.
 register event on document and then bubble
 */