"use strict";

var gtdo = angular.module('gtdo', ['ui.calendar']);

gtdo.controller('TimeLogController', function() {
    var tlc = this;

    tlc.tasks = [{
        "key": "T0001",
        "title": "Fetch groceries",
        "due": "20150106",
        "deps": ["T0002", "T0003", "T0006"]
    }, {
        "key": "T0002",
        "title": "Buy mineral water",
        "time": 2
    }, {
        "key": "T0003",
        "title": "Buy cola",
        "deps": ["T0004", "T0005"]
    }, {
        "key": "T0004",
        "title": "Look for cola",
        "time": 1
    }, {
        "key": "T0005",
        "title": "Pick up cola",
        "time": 0.5,
        "done": true
    }, {
        "key": "T0006",
        "title": "Buy vegetables",
        "deps": ["T0007", "T0008"]
    }, {
        "key": "T0007",
        "title": "Buy carrot",
        "time": 0.2
    }, {
        "key": "T0008",
        "title": "Buy salad",
        "time": 0.2
    }, {
        "key": "T0009",
        "title": "Solve all life's problems",
        "deps": ["T0010", "T0011"]
    }, {
        "key": "T0010",
        "title": "Work on stuff",
        "time": 4
    }, {
        "key": "T0011",
        "title": "Clean the room",
        "time": 2
    }];
});
