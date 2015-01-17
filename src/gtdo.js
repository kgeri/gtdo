"use strict";
var gtdo = gtdo || {};

gtdo.common = {
  keyFn: function(d) { return d.key },

  assignOrdinals: function(data) {
    var ord = 0;
    for (var i = 0; i < data.length; i++) data[i].ord = ord++;
  },

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

gtdo.SearchFilter = function() {

  this.bind = function(inputSelector, view) {
    d3.select(inputSelector)
    .on("input", null)  // remove any previous listeners
    .on("input", function(d) {
      var cleanQuery = clean(this.value);
      view.items().style("display", function(d) {
        return !cleanQuery || matches(clean(d.title), cleanQuery) ? "" : "none";
      });
    });
    return this;
  };

  var clean = function(text) {
    var words = text.toLowerCase().split(" ");
    return words;
  };

  var matches = function(cleanText, cleanQuery) {
    // TODO improve text matching here
    for(var i=0; i < cleanText.length; i++) {
      for(var j=0; j < cleanQuery.length; j++) {
        if(cleanText[i].indexOf(cleanQuery[j]) > -1) return true;
      }
    }
    return false;
  };
}

gtdo.ListView = function() {
  var width = undefined;
  var height = undefined;
  // TODO compute values from screen size
  var itemWidth = 200;
  var itemHeight = 100;
  var tasks = undefined;
  var taskItems = undefined;

  this.bind = function(containerSelector, data) {
    tasks = d3.select(containerSelector);

    gtdo.common.assignOrdinals(data);

    taskItems = tasks.selectAll("div")
    .data(data, gtdo.common.keyFn);

    taskItems.enter()
    .append("div")
    .call(updateListViewItem)
    .each(setPositionByOrdinal)
    .call(moveToNow);

    taskItems.call(d3.behavior.drag()
    .on("drag", drag)
    .on("dragend", dragend));

    return this;
  };

  this.resize = function() {
    var bbox = tasks.node().getBoundingClientRect();
    width = bbox.width;
    height = bbox.height;
    taskItems
    .each(setPositionByOrdinal)
    .call(moveToNow);
  };

  this.items = function() { return taskItems };

  var updateListViewItem = function(selection) {
    selection
    .style("width", itemWidth)
    .style("height", itemHeight)
    .text(function(d) { return d.title });
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
    .style("left", function(d) { return d.x+"px" })
    .style("top", function(d) { return d.y+"px" });
  };

  var drag = function(d) {
    d.x += d3.event.dx;
    d.y += d3.event.dy;
    d.x = Math.max(d.x, 0), d.x = Math.min(d.x, width);
    d.y = Math.max(d.y, 0), d.y = Math.min(d.y, height);

    d3.select(this).call(moveToNow);

    var oldOrd = d.ord;
    var newOrd = positionToOrdinal(d.x + itemWidth / 2, d.y + itemHeight / 2);
    newOrd = Math.max(newOrd, 0), newOrd = Math.min(newOrd, data.length-1);

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
    } else {
      return;
    }
    d.ord = newOrd;

    taskItems
    .filter(function(d) { return d.needsRefresh ? d : null })
    .each(setPositionByOrdinal)
    .call(moveToSmooth);
  };

  var dragend = function(d) {
    setPositionByOrdinal(d)
    d3.select(this).call(moveToSmooth);
  };
}

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
