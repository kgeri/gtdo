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
      view.items().attr("visibility", function(d) {
        return !cleanQuery || matches(clean(d.title), cleanQuery) ? "visible" : "hidden";
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
  var itemHeight = 100;
  var taskItems = undefined;

  this.bind = function(containerSelector, data) {
    var tasks = d3.select(containerSelector);

    gtdo.common.assignOrdinals(data);

    taskItems = tasks.selectAll("g")
    .data(data, gtdo.common.keyFn)
    .enter().append("g")
    .each(setPosition)
    .call(moveToNow);

    taskItems.append("rect")
    .attr("width", 200 )
    .attr("height", itemHeight-1);

    taskItems.append("text")
    .attr("x", 10 )
    .attr("y", itemHeight / 2)
    .attr("dy", ".35em")
    .text(function(d) { return d.title });

    taskItems.call(d3.behavior.drag()
    .on("dragstart", dragstart)
    .on("drag", dragVertical)
    .on("dragend", dragend));

    return this;
  };

  this.items = function() { return taskItems };

  var setPosition = function(d) {
    d.x = 0;
    d.y = d.ord * itemHeight;
  };

  var moveToSmooth = function(selection) {
    moveToNow(selection.transition().duration(250));
  };
  var moveToNow = function(selection) {
    selection.attr("transform", function(d) { return "translate("+d.x+","+d.y+")" });
  };

  var dragstart = function(d) {
    d.x = 10;
    d3.select(this).call(moveToNow);
  };

  var dragend = function(d) {
    setPosition(d);
    d3.select(this).call(moveToSmooth);
  };

  var dragVertical = function(d) {
    d.x = 10;
    d.y = d.y + d3.event.dy;

    var halfHeight = itemHeight / 2;
    var delta = d.y - (d.ord * itemHeight);

    d.y = Math.min(d.y, (data.length-1) * itemHeight);
    d.y = Math.max(d.y, 0);

    if(Math.abs(delta) > halfHeight) {
      data.sort(function(d1, d2) {
        if(d1 === d || d2 === d) return d1.y - d2.y + Math.abs(delta);
        else return d1.y - d2.y;
      });
      gtdo.common.assignOrdinals(data);

      taskItems.filter(function(di) { return di === d ? null : di })
      .each(setPosition)
      .call(moveToSmooth);
    } else {
      d3.select(this).call(moveToNow);
    }
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
    .style("fill", function(d) { return color((d.children ? d : d.parent).title) })
    .on("click", function(d) {
      selectedNode = d;
      taskItems.transition()
      .duration(500)
      .attrTween("d", arcTween(d));
      highlight.transition()
      .duration(500)
      .attrTween("r", function(d) { return highlightTween });
    })
    .on("mouseover", function(d) { explanation.text(d.title) })
    .on("mouseleave", function(d) { explanation.text(selectedNode.title) });

    explanation
    .style("visibility", "visible")
    .style("left", dim.width + "px")
    .style("top", "20px") // TODO compute coordinate instead
    .text(selectedNode.title);

    return this;
  };

  this.items = function() { return taskItems };
}
