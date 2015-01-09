"use strict";
var gtdo = gtdo || {};

gtdo.common = {
  keyFn: function(d) { return d.key },
  pathKeyFn: function(d) { return "path-" + gtdo.common.keyFn(d) },
  pathKeyIdFn: function(d) { return "#" + gtdo.common.pathKeyFn(d) },

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
    root.children = [];
    for(var i=0; i < data.length; i++) {
      var d = data[i];
      if(!d.parent) root.children.push(d);
    }

    return root;
  },

  arc: function(x1, y1, x2, y2, radius) {
    return "M"+x1+" "+y1+" A "+radius+" "+radius+" 0 0 1 "+x2+" "+y2;
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

  this.bind = function(containerSelector, data) {
    var dim = { "width": 800, "height": 600}; // TODO get this from the SVG size
    var radius = Math.min(dim.width, dim.height) / 2;

    var partition = d3.layout.partition()
    .size([2 * Math.PI, radius * radius])
    .value(function (d) { return d.time });

    var root = gtdo.common.toHierarchy(data);
    var nodes = partition.nodes(root)
    .filter(function(d) { return d.parent; });

    var maxDepth = d3.max(nodes, function(d) { return d.depth });

    var svg = d3.select(containerSelector);

    var tasks = svg.append("g")
    .attr("transform", "translate(" + dim.width / 2 + "," + dim.height / 2 + ")");

    taskItems = tasks.selectAll("path")
    .data(nodes)
    .enter()
    .append("g");

    taskItems.append("path")
    .attr("d", arc(radius, maxDepth))
    .attr("fill-rule", "evenodd")
    .style("fill", fill)
    .style("opacity", 1);

    return this;
  };

  this.items = function() { return taskItems };

  var arc = function(radius, maxDepth) {
    var md = maxDepth + 1;
    return d3.svg.arc()
    .startAngle(function (d) { return d.x })
    .endAngle(function (d) { return d.x + d.dx })
    .innerRadius(function (d) { return Math.sqrt(d.y) })
    .outerRadius(function (d) { return Math.sqrt(d.y + d.dy) });
  }

  var hue = d3.scale.category10();

  var luminance = d3.scale.sqrt()
  .domain([0, 10]) // TODO determine scale from data
  .clamp(true)
  .range([90, 30]);

  var fill = function(d) {
    var p = d;
    while (p.depth > 1) p = p.parent;
    var c = d3.lab(hue(p.title));
    c.l = luminance(d.value);
    return c;
  };
}
