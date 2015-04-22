(function main($window) {

    "use strict";

    /**
     * @method throwException
     * @throws {Error}
     * @return {void}
     */
    function throwException(message) {
        throw 'L.Pather: ' + message + '.';
    }

    if (typeof L === 'undefined') {

        // Ensure Leaflet.js has been included before Pather.
        throwException('Leaflet.js is required: http://leafletjs.com/');

    }

    /**
     * @constant MODES
     * @type {{VIEW: number, CREATE: number, EDIT: number, DELETE: number, APPEND: number, EDIT_APPEND: number, ALL: number}}
     */
    var MODES = {
        VIEW:        1,
        CREATE:      2,
        EDIT:        4,
        DELETE:      8,
        APPEND:      16,
        EDIT_APPEND: 4 | 16,
        ALL:         1 | 2 | 4 | 8 | 16
    };

    /**
     * @module Pather
     * @author Adam Timberlake
     * @link https://github.com/Wildhoney/L.Pather
     */
    L.Pather = L.FeatureGroup.extend({

        /**
         * @method initialize
         * @param {Object} [options={}]
         * @return {void}
         */
        initialize: function initialize(options) {

            this.options   = Object.assign(this.defaultOptions(), options || {});
            this.creating  = false;
            this.polylines = [];

        },

        /**
         * @method createPath
         * @param {L.LatLng[]} latLngs
         * @return {L.Pather.Polyline|Boolean}
         */
        createPath: function createPath(latLngs) {

            if (latLngs.length <= 1) {
                return false;
            }

            this.clearAll();

            var polyline = new L.Pather.Polyline(this.map, latLngs, this.options, {
                fire: this.fire.bind(this),
                mode: this.getMode.bind(this),
                remove: this.removePath.bind(this)
            });

            this.polylines.push(polyline);

            this.fire('created', {
                polyline: polyline,
                latLngs: polyline.getLatLngs()
            });

            return polyline;

        },

        /**
         * @method removePath
         * @param {L.Pather.Polyline} model
         * @return {Boolean}
         */
        removePath: function removePath(model) {

            if (model instanceof L.Pather.Polyline) {

                var indexOf = this.polylines.indexOf(model);
                this.polylines.splice(indexOf, 1);

                model.softRemove();

                this.fire('deleted', {
                    polyline: model,
                    latLngs: []
                });

                return true;

            }

            return false;

        },

        /**
         * @method getPaths
         * @return {Array}
         */
        getPaths: function getPolylines() {
            return this.polylines;
        },

        /**
         * @method onAdd
         * @param {L.Map} map
         * @return {void}
         */
        onAdd: function onAdd(map) {

            var element        = this.element = this.options.element || map._container;
            this.draggingState = map.dragging._enabled;
            this.map           = map;
            this.fromPoint     = { x: 0, y: 0 };
            this.svg           = d3.select(element)
                                   .append('svg')
                                       .attr('pointer-events', 'none')
                                       .attr('class', this.getOption('moduleClass'))
                                       .attr('width', this.getOption('width'))
                                       .attr('height', this.getOption('height'));

            map.dragging.disable();

            // Attach the mouse events for drawing the polyline.
            this.attachEvents(map);
            this.setMode(this.options.mode);

        },

        /**
         * @method attachEvents
         * @param {L.Map} map
         * @return {void}
         */
        attachEvents: function attachEvents(map) {

            /**
             * @method getEvent
             * @param {Object} event
             * @return {Object}
             */
            function getEvent(event) {

                if (event.touches) {
                    return event.touches[0];
                }

                return event;

            }

            /**
             * @method manipulatingEdges
             * @return {Object}
             */
            var manipulatingEdges = function manipulatingEdges() {

                return this.polylines.filter(function filter(polyline) {
                    return polyline.manipulating;
                });

            }.bind(this);

            /**
             * @method hasCreatePermission
             * @return {Boolean}
             */
            var hasCreatePermission = function hasCreatePermission() {
                return !!(this.options.mode & MODES.CREATE);
            }.bind(this);

            map.on('mousedown', function mousedown(event) {

                event = event.originalEvent || getEvent(event);

                var containerPoint = this.map.mouseEventToContainerPoint(event),
                    point          = this.map.containerPointToLayerPoint(containerPoint),
                    latLng         = this.map.layerPointToLatLng(point);

                if (hasCreatePermission() && manipulatingEdges().length === 0) {

                    this.creating  = true;
                    this.fromPoint = map.latLngToContainerPoint(latLng);
                    this.latLngs   = [];

                }

            }.bind(this));

            map._container.addEventListener('mouseleave', function mouseleave() {

                this.clearAll();
                this.creating = false;

            }.bind(this));

            map.on('mousemove', function mousemove(event) {

                event     = event.originalEvent || getEvent(event);
                var point = this.map.mouseEventToContainerPoint(event);

                if (manipulatingEdges().length > 0) {
                    manipulatingEdges()[0].moveTo(point);
                    return;
                }

                var lineFunction = d3.svg.line()
                                     .x(function x(d) { return d.x; })
                                     .y(function y(d) { return d.y; })
                                     .interpolate('linear');

                if (this.creating) {

                    var lineData = [this.fromPoint, new L.Point(point.x, point.y, false)];
                    this.latLngs.push(point);

                    this.svg.append('path')
                            .classed(this.getOption('lineClass'), true)
                                .attr('d', lineFunction(lineData))
                                .attr('stroke', this.getOption('strokeColour'))
                                .attr('stroke-width', this.getOption('strokeWidth'))
                                .attr('fill', 'none');

                    this.fromPoint = { x: point.x, y: point.y };

                }

            }.bind(this));

            map.on('mouseup', function mouseup() {

                if (manipulatingEdges().length === 0) {

                    this.creating = false;
                    this.createPath(this.convertPointsToLatLngs(this.latLngs));
                    this.latLngs  = [];
                    return;

                }

                manipulatingEdges()[0].attachElbows();
                manipulatingEdges()[0].finished();
                manipulatingEdges()[0].manipulating = false;

            }.bind(this));

            // Attach the mobile events that delegate to the desktop events.
            this.map._container.addEventListener('touchstart', this.fire.bind(map, 'mousedown'));
            this.map._container.addEventListener('touchmove', this.fire.bind(map, 'mousemove'));
            this.map._container.addEventListener('touchend', this.fire.bind(map, 'mouseup'));

        },

        /**
         * @method convertPointsToLatLngs
         * @param {Point[]} points
         * @return {LatLng[]}
         */
        convertPointsToLatLngs: function convertPointsToLatLngs(points) {

            return points.map(function map(point) {
                return this.map.containerPointToLatLng(point);
            }.bind(this));

        },

        /**
         * @method clearAll
         * @return {void}
         */
        clearAll: function clearAll() {
            this.svg.text('');
        },

        /**
         * @method getOption
         * @param {String} property
         * @return {String|Number}
         */
        getOption: function getOption(property) {
            return this.options[property] || this.defaultOptions()[property];
        },

        /**
         * @method defaultOptions
         * @return {Object}
         */
        defaultOptions: function defaultOptions() {

            return {
                moduleClass: 'pather',
                lineClass: 'drawing-line',
                detectTouch: true,
                elbowClass: 'elbow',
                strokeColour: 'rgba(0,0,0,.5)',
                strokeWidth: 2,
                width: '100%',
                height: '100%',
                smoothFactor: 10,
                pathColour: 'black',
                pathOpacity: 0.55,
                pathWidth: 3,
                mode: MODES.ALL
            };

        },

        /**
         * @method setSmoothFactor
         * @param {Number} smoothFactor
         * @return {void}
         */
        setSmoothFactor: function setSmoothFactor(smoothFactor) {
            this.options.smoothFactor = parseInt(smoothFactor);
        },

        /**
         * @method setMode
         * @param {Number} mode
         * @return {void}
         */
        setMode: function setMode(mode) {

            this.setClassName(mode);
            this.options.mode = mode;

            var tileLayer = this.map._container.querySelector('.leaflet-tile-pane');

            /**
             * @method shouldDisableDrag
             * @return {Boolean}
             * @see http://www.stucox.com/blog/you-cant-detect-a-touchscreen/
             */
            var shouldDisableDrag = function shouldDisableDrag() {

                if (this.detectTouch && ('ontouchstart' in $window || 'onmsgesturechange' in $window)) {
                    return (this.options.mode & MODES.CREATE || this.options.mode & MODES.EDIT);
                }

                return (this.options.mode & MODES.CREATE);

            }.bind(this);

            if (shouldDisableDrag()) {

                var originalState = this.draggingState ? 'disable' : 'enable';
                tileLayer.style.pointerEvents = 'none';
                return void this.map.dragging[originalState]();

            }

            tileLayer.style.pointerEvents = 'all';
            this.map.dragging.enable();

        },

        /**
         * @method setClassName
         * @param {Number} mode
         * @return {void}
         */
        setClassName: function setClassName(mode) {

            /**
             * @method conditionallyAppendClassName
             * @param {String} modeName
             * @return {void}
             */
            var conditionallyAppendClassName = function conditionallyAppendClassName(modeName) {

                var className = ['mode', modeName].join('-');

                if (MODES[modeName.toUpperCase()] & mode) {
                    return void this.element.classList.add(className);
                }

                this.element.classList.remove(className);

            }.bind(this);

            conditionallyAppendClassName('create');
            conditionallyAppendClassName('delete');
            conditionallyAppendClassName('edit');
            conditionallyAppendClassName('append');
        },

        /**
         * @method getMode
         * @return {Number}
         */
        getMode: function getMode() {
            return this.options.mode;
        },

        /**
         * @method setOptions
         * @param {Object} options
         * @return {void}
         */
        setOptions: function setOptions(options) {
            this.options = Object.assign(this.options, options || {});
        }

    });

    /**
     * @constant L.Pather.MODE
     * @type {Object}
     */
    L.Pather.MODE = MODES;

    // Simple factory that Leaflet loves to bundle.
    L.pather = function pather(options) {
        return new L.Pather(options);
    };

})(window);