"use strict";
var gtdo = gtdo || {};

/**
* Common functions for handling task entities.
*/
gtdo.common = {
  keyFn: function(d) { return d.key },
  notDoneFn: function(d) { return !d.done },
  ordFn: function(d1, d2) { return d1.ord - d2.ord },

  /**
  * Assigns d.ord = i for each datum.
  */
  assignOrdinals: function(data) {
    var ord = 0;
    data.forEach(function(d) { d.ord = ord++ });
  },

  /**
  * Sets d.ord=newOrd, and makes sure that no other datum has the same ord in data. Shifts the other entries' .ord value if necessary.
  * Sets d.needsRefresh on all entries as a side-effect. This is used to improve redraw performance.
  */
  reorder: function(d, data, newOrd) {
    var oldOrd = d.ord;

    data.forEach(function(d) { d.needsRefresh = false });

    if(oldOrd < newOrd) {
      data.forEach(function(d) {
        if(d.ord > oldOrd && d.ord <= newOrd) {
          d.ord -= 1;
          d.needsRefresh = true;
        }
      });
    } else if(oldOrd > newOrd) {
      data.forEach(function(d) {
        if(d.ord >= newOrd && d.ord < oldOrd) {
          d.ord += 1;
          d.needsRefresh = true;
        }
      });
    }
    d.ord = newOrd;

    // TODO this sort was needed because otherwise we'd lose the .ord of completed tasks... think of a better way to solve this
    data.sort(gtdo.common.ordFn);
  },

  /**
  * Converts the input task data array to a tree, based on the d.deps arrays.
  * The root of this tree will be generated as 'All tasks'.
  */
  toHierarchy: function(data) {
    var dataMap = {};

    for(var i=0; i < data.length; i++) {
      dataMap[data[i].key] = data[i];
    }

    for(var i=0; i < data.length; i++) {
      var d = data[i];
      if(d.deps) {
        d.children = [];
        for(var j=0; j < d.deps.length; j++) {
          var dep = dataMap[d.deps[j]];
          if(dep) {
            dep.parent = d;
            d.children.push(dep);
          }
        }
      }
    }

    var root = {};
    root.title = "All tasks";
    root.children = [];
    for(var i=0; i < data.length; i++) {
      var d = data[i];
      if(!d.parent) root.children.push(d);
    }

    return root;
  }
}

/**
* A simple filter for fading out any DOM nodes that don't match the query.
*/
gtdo.SearchFilter = function() {

  this.bind = function(inputSelector, view) {
    d3.select(inputSelector)
    .on("input", null)  // remove any previous listeners
    .on("input", function(d) {
      var cleanQuery = clean(this.value);
      view.items().style("opacity", function(d) {
        return matches(clean(d.title), cleanQuery) ? "" : "0.25";
      });
    });
    return this;
  };

  var clean = function(text) {
    var words = text.toLowerCase().trim().split(" ");
    return words;
  };

  /**
  * This returns true if all the words in cleanQuery are substrings of any of the words in cleanText.
  */
  var matches = function(cleanText, cleanQuery) {
    // TODO improve text matching here
    var matches = true;
    for(var i=0; i < cleanQuery.length; i++) {
      var matchFound = false;
      for(var j=0; j < cleanText.length; j++) {
        if(cleanText[j].indexOf(cleanQuery[i]) >= 0) {
          matchFound = true;
          break;
        }
      }
      matches &= matchFound;
    }
    return matches;
  };
}

/**
* A list view for creating, editing and reordering tasks.
*/
gtdo.ListView = function() {
  var self = this;
  var width = undefined;
  var height = undefined;
  // TODO compute values from screen size
  var itemWidth = 300;
  var itemHeight = 84;
  var tasks = undefined;
  var taskItems = undefined;
  var isShowDone = false;

  this.bind = function(containerSelector, data) {
    self.data = data;
    tasks = d3.select(containerSelector);
    taskItems = tasks.selectAll("div");
    return this;
  };

  this.layout = function() {
    var bbox = tasks.node().getBoundingClientRect();
    width = bbox.width;
    height = bbox.height;

    var data = activeTasks();
    taskItems = taskItems
    .data(data, gtdo.common.keyFn);
    taskItems.enter().call(createItem);
    taskItems.exit().remove();

    gtdo.common.assignOrdinals(data);

    taskItems
    .each(setPositionByOrdinal)
    .call(moveToSmooth);
  };

  this.items = function() { return taskItems };
  this.showDone = function(boolean) {
    isShowDone = boolean;
    self.layout();
  };

  var activeTasks = function() {
    return isShowDone ? self.data : self.data.filter(gtdo.common.notDoneFn);
  };

  var createItem = function(selection) {
    var div = selection
    .append("div")
    .style("width", itemWidth)
    .style("height", itemHeight);

    var toolbar = div.append("span").attr("class", "toolbar");

    var dragBtn = toolbar.append("i").attr("class", "fa fa-bars");
    var moveUpBtn = toolbar.append("i").attr("class", "fa fa-arrow-up").attr("title", "Move to top");
    var moveDownBtn = toolbar.append("i").attr("class", "fa fa-arrow-down").attr("title", "Move to bottom");
    var completeBtn = toolbar.append("i").attr("class", "fa fa-check").attr("title", "Complete/uncomplete");

    var details = div.append("div").attr("class", "details");

    details.append("div")
    .attr("class", "title").text(function(d) { return d.title });
    details.append("span")
    .attr("class", "due").text(function(d) { return d.due });
    details.append("span")
    .attr("class", "time").text(function(d) { return d.time ? d.time+"h" : "" });

    dragBtn.call(d3.behavior.drag()
    .on("dragstart", dragstart).on("drag", drag).on("dragend", dragend));
    moveUpBtn.on("click", function(d) {
      gtdo.common.reorder(d, activeTasks(), 0);
      taskItems.each(setPositionByOrdinal).call(moveToSmooth);
    });
    moveDownBtn.on("click", function(d) {
      gtdo.common.reorder(d, activeTasks(), activeTasks().length-1);
      taskItems.each(setPositionByOrdinal).call(moveToSmooth);
    });
    completeBtn.on("click", function(d) {
      d.done = !d.done;
      self.layout();
    });
  };

  var ordinalToPosition = function(ord) {
    var maxItems = Math.floor(height / itemHeight);
    return {
      "x": Math.floor(ord / maxItems) * itemWidth,
      "y": (ord % maxItems) * itemHeight
    };
  };

  var positionToOrdinal = function(x, y) {
    var maxItems = Math.floor(height / itemHeight);
    var row = Math.floor(y / itemHeight)
    var column = Math.floor(x / itemWidth);
    return column * maxItems + row;
  }

  var setPositionByOrdinal = function(d) {
    var pos = ordinalToPosition(d.ord);
    d.x = pos.x, d.y = pos.y;
  };

  var moveToSmooth = function(selection) {
    moveToNow(selection.transition().duration(250));
  };
  var moveToNow = function(selection) {
    selection
    .attr("class", function(d) { return d.done ? "done" : "" })
    .style("left", function(d) { return d.x+"px" })
    .style("top", function(d) { return d.y+"px" });
  };

  var draggedItem = undefined;
  var dragstart = function(d) {
    draggedItem = d3.select(this.parentNode.parentNode);
    taskItems.style("z-index", "0");
    draggedItem.style("z-index", "1");
  };

  var drag = function(d) {
    var coords = d3.mouse(tasks.node());
    d.x = coords[0] - 8, d.y = coords[1] - 8; // TODO d3.event.dx was acting up
    d.x = Math.max(d.x, 0), d.x = Math.min(d.x, width);
    d.y = Math.max(d.y, 0), d.y = Math.min(d.y, height);

    draggedItem.call(moveToNow);

    var newOrd = positionToOrdinal(d.x + itemWidth / 2, d.y + itemHeight / 2);
    newOrd = Math.max(newOrd, 0), newOrd = Math.min(newOrd, activeTasks().length-1);

    gtdo.common.reorder(d, activeTasks(), newOrd);

    taskItems
    .filter(function(d) { return d.needsRefresh ? d : null })
    .each(setPositionByOrdinal)
    .call(moveToSmooth);
  };

  var dragend = function(d) {
    setPositionByOrdinal(d)
    draggedItem.call(moveToSmooth);
  };
}

/**
* A sunburst diagram for investigating task dependencies.
*/
gtdo.HierarchyView = function() {
  var taskItems = undefined;
  var selectedNode = undefined;

  this.bind = function(containerSelector, explanationSelector, data) {
    var svg = d3.select(containerSelector);
    var explanation = d3.select(explanationSelector);

    var dim = { "width": 800, "height": 600}; // TODO get this from the SVG size
    var radius = Math.min(dim.width, dim.height) / 2;

    var partition = d3.layout.partition()
    .value(function (d) { return d.time });

    var root = gtdo.common.toHierarchy(data);
    selectedNode = root;

    var nodes = partition.nodes(root);

    var color = d3.scale.category20c();
    var colorFn = function(d) { return color((d.children ? d : d.parent).title) };
    var xScale = d3.scale.linear().range([0, 2 * Math.PI]);
    var yScale = d3.scale.sqrt().range([0, radius]);

    var arc = d3.svg.arc()
    .startAngle(function(d) { return Math.max(0, Math.min(2 * Math.PI, xScale(d.x))) })
    .endAngle(function(d) { return Math.max(0, Math.min(2 * Math.PI, xScale(d.x + d.dx))) })
    .innerRadius(function(d) { return Math.max(0, yScale(d.y)) })
    .outerRadius(function(d) { return Math.max(0, yScale(d.y + d.dy)) });

    var arcTween = function(d) {
      var xd = d3.interpolate(xScale.domain(), [d.x, d.x + d.dx]),
      yd = d3.interpolate(yScale.domain(), [d.y, 1]),
      yr = d3.interpolate(yScale.range(), [d.y ? 20 : 0, radius]);
      return function(d, i) {
        return i
        ? function(t) { return arc(d); }
        : function(t) { xScale.domain(xd(t)); yScale.domain(yd(t)).range(yr(t)); return arc(d); };
      };
    };

    var highlightTween = function() {
      return yScale(selectedNode.y + selectedNode.dy);
    };

    var tasks = svg.append("g")
    .attr("transform", "translate(" + dim.width / 2 + "," + dim.height / 2 + ")");

    var highlight = svg.append("circle")
    .attr("class", "highlight")
    .attr("cx", dim.width / 2)
    .attr("cy", dim.height / 2)
    .attr("r", highlightTween);

    taskItems = tasks.selectAll("path")
    .data(nodes)
    .enter()
    .append("path")
    .attr("d", arc)
    .style("fill", colorFn)
    .on("click", function(d) {
      selectedNode = d;
      taskItems.transition()
      .duration(500)
      .attrTween("d", arcTween(d));
      highlight.transition()
      .duration(500)
      .attrTween("r", function(d) { return highlightTween });
    })
    .on("mouseover", function(d) {
      d3.select(this).style("fill", "gold");
      explanation.text(d.title);
    })
    .on("mouseleave", function(d) {
      taskItems.style("fill", colorFn);
      explanation.text(selectedNode.title);
    });

    explanation
    .style("visibility", "visible")
    .style("left", dim.width + "px")
    .style("top", "20px") // TODO compute coordinate instead
    .text(selectedNode.title);

    return this;
  };

  this.items = function() { return taskItems };
}

/**
* A simple class-based check box for toggling a selection.
*/
gtdo.CheckBox = function(uncheckedClass, checkedClass) {
  var self = this;
  var checked = false;
  var checkBox = undefined;
  var listener = undefined;

  /**
  * Binds this check box to a specific element, calling checkListener(boolean) when the element is clicked.
  */
  this.bind = function(buttonSelector, checkListener) {
    listener = checkListener
    checkBox = d3.select(buttonSelector)
    .classed(uncheckedClass, true)
    .on("click", self.toggle);
    return self;
  };

  this.toggle = function() {
    self.checked = !self.checked;
    checkBox.classed(checkedClass, self.checked);
    checkBox.classed(uncheckedClass, !self.checked);
    listener(self.checked);
  };
};
