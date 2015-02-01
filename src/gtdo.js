"use strict";
var gtdo = gtdo || {};

/**
* Pimps Function.args with a new method called partial(...), that returns a partial function using the specified arguments.
*/
Function.prototype.args = function() {
  if (typeof this !== "function") throw new TypeError("Function.prototype.arg needs to be called on a function");
  var slice = Array.prototype.slice;
  var args = slice.call(arguments);
  var fn = this;
  return function() { return fn.apply(this, args.concat(slice.call(arguments))) };
};

/**
* Common functions for handling task entities.
*/
gtdo.common = {
  keyFn: function(d) { return d.key },
  notDoneFn: function(d) { return !d.done },
  ordFn: function(d1, d2) { return d1.ord - d2.ord },

  toDatePickerDate: function(value) {
    if(!value) return undefined;
    return value.replace(/(\d{4})(\d{2})(\d{2})/, function(match, year, month, date) {
      return year+"-"+month+"-"+date;
    });
  },

  closest: function(node, className) {
    var currentNode = d3.select(node).node();
    while(currentNode) {
      var cls = currentNode.getAttribute("class");
      if(cls && cls.indexOf("task") >= 0) return d3.select(currentNode);
      currentNode = currentNode.parentNode;
    }
    throw new Error("Selection "+selection+" does not have a .task parent");
  },

  /**
  * Moves the datum d to the position newOrd in the data array.
  */
  reorder: function(d, data, newOrd) {
    var oldOrd = data.indexOf(d);
    data.splice(newOrd, 0, data.splice(oldOrd, 1)[0]);
  },

  /**
  * Converts the input task data array to a tree, based on the d.deps arrays.
  * The root of this tree will be generated as 'All tasks'.
  */
  toHierarchy: function(data) {
    var dataMap = {};

    data.forEach(function(d) { dataMap[d.key] = d });

    data.forEach(function(d) {
      if(d.deps) {
        d.children = [];
        d.deps.forEach(function(depKey) {
          var dep = dataMap[depKey];
          if(dep) {
            dep.parent = d;
            d.children.push(dep);
          }
        });
      }
    });

    var root = {};
    root.title = "All tasks";
    root.children = [];
    data.forEach(function(d) {
      if(!d.parent) root.children.push(d);
    });

    return root;
  },

  /**
  * Binds the element identified by 'selector' to 'property'.
  * The 'property' is expected to be a function(value), where value is optional.
  * Omitting the value should return the current value, specifying it should update.
  */
  bind: function(selector, property) {
    var editor = d3.select(selector).on("blur", null);
    switch(editor.node().tagName.toUpperCase()) {
      case "TEXTAREA":
      case "INPUT":
        editor.property("value", property() ? property() : "");
        editor.on("blur", function() { property(this.value) });
        break;
      default:
        throw new Error("Unsupported editor: " + editor.node());
    }
  }
};

/**
* A simple filter for fading out any DOM nodes that don't match the query.
*/
gtdo.SearchFilter = function() {

  this.bind = function(inputSelector, view) {
    d3.select(inputSelector)
    .on("input", null)  // remove any previous listeners
    .on("input", function(d) {
      var cleanQuery = clean(this.value);
      view.items().style("display", function(d) {
        return matches(clean(d.title), cleanQuery) ? "" : "none";
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
};

gtdo.ListView = function() {
  var self = this;
  var editor = new gtdo.TaskEditor();
  var isShowDone = false;
  var tasks = undefined;
  var taskItems = undefined;
  var selectionHandler = undefined;

  this.bind = function(selector, data) {
    self.data = data;
    tasks = d3.select(selector);
    taskItems = tasks.selectAll(".task");

    $(selector).sortable();
    $(selector).disableSelection();

    return this;
  };

  this.layout = function() {
    taskItems = taskItems.data(activeTasks(), gtdo.common.keyFn);
    taskItems.enter().call(createItem);
    taskItems.exit().remove();
    taskItems.order();

    taskItems
    .call(updateContents)
    .on("mouseenter", null)
    .on("mouseenter", function() {
      editor.bind(this)
      .onMoveUp(function(d) {
        gtdo.common.reorder(d, self.data, 0);
        self.layout();
      })
      .onMoveDown(function(d) {
        gtdo.common.reorder(d, self.data, self.data.length-1);
        self.layout();
      })
      .onComplete(function(d) {
        d.done = !d.done;
        updateContents(gtdo.common.closest(this, "task"));
      });
    })
    .on("mouseleave", null)
    .on("mouseleave", function() {
      editor.unbind();
    });

    if(selectionHandler) {
      taskItems.on("click", null).on("click", function(d) {
        var task = gtdo.common.closest(this, "task");
        selectionHandler(function(name, value) {
          if(!value) return d[name];
          else {
            d[name] = value;
            updateContents(task);
          }
        });
      });
    }
  };

  this.onSelection = function(handler) {
    selectionHandler = handler;
  };

  this.items = function() { return taskItems };
  this.showDone = function(boolean) {
    isShowDone = boolean;
    self.layout();
    return this;
  };

  var activeTasks = function() {
    return isShowDone ? self.data : self.data.filter(gtdo.common.notDoneFn);
  };

  /** Creates a task item and wires its buttons. See also updateContents(). */
  var createItem = function(selection) {
    var task = selection.append("div").classed("task panel panel-primary", true);
    var body = task.append("div").classed("title panel-body", true);
    var footer = task.append("div").classed("panel-footer", true);
    footer.append("span").classed("due badge", true);
    footer.append("span").classed("time badge", true);
  };

  var updateContents = function(task) {
    task.classed("done", function(d) { return d.done ? true : false });
    task.select(".title").text(function(d) { return d.title });
    task.select(".due").text(function(d) { return d.due });
    task.select(".time").text(function(d) { return d.time ? d.time+"h" : "-h" });
  };
};

/**
* A hovering editor for manipulating tasks.
* Supports 'move to top', 'move to bottom', and 'mark as completed'.
*/
gtdo.TaskEditor = function() {
  var editor = undefined;
  var buttonSize = undefined;
  var selectedButtonSize = undefined;
  var topBtn = undefined;
  var bottomBtn = undefined;
  var rightBtn = undefined;

  this.bind = function(selector) {
    if(editor) editor.remove();

    var item = d3.select(selector);
    var size = item.node().getBoundingClientRect();
    var w = size.width, h = size.height;

    // TODO compute these
    buttonSize = 40; selectedButtonSize = 60;
    var fontSize = buttonSize / 2;

    editor = item.append("span").style("width", w+"px").style("height", h+"px");

    var svg = editor.append("svg").attr("class", "overlay");
    topBtn = svg.append("circle").attr("id", "top").attr("cx", w / 2).attr("cy", -buttonSize/2);
    bottomBtn = svg.append("circle").attr("id", "bottom").attr("cx", w / 2).attr("cy", h + buttonSize/2);
    rightBtn = svg.append("circle").attr("id", "right").attr("cx", w + buttonSize/2).attr("cy", h / 2);

    topBtn.append("title").text("Move to top");
    bottomBtn.append("title").text("Move to bottom");
    rightBtn.append("title").text("Complete/uncomplete");

    var moveUp = editor.append("i")
    .classed("glyphicon glyphicon-arrow-up editor-button", true)
    .style("right", (w / 2 - fontSize / 2) + "px").style("top", "4px");

    var moveDown = editor.append("i")
    .classed("glyphicon glyphicon-arrow-down editor-button", true)
    .style("right", (w / 2 - fontSize / 2) + "px").style("top", (h - fontSize - 4) + "px");

    var complete = editor.append("i")
    .classed("glyphicon glyphicon-ok editor-button", true)
    .style("right", "4px").style("top", (h / 2 - fontSize / 2) + "px");

    editor.selectAll("i").style("font-size", fontSize + "px");

    svg.selectAll("circle")
    .attr("r", 0).attr("r", buttonSize)
    .on("mouseenter", buttonMouseEnter).on("mouseleave", buttonMouseLeave);

    return this;
  };

  this.unbind = function() {
    if(!editor) return; editor.remove();
  };

  this.onMoveUp = function(handler) {
    topBtn.on("click", handler);
    return this;
  };

  this.onMoveDown = function(handler) {
    bottomBtn.on("click", handler);
    return this;
  };

  this.onComplete = function(handler) {
    rightBtn.on("click", handler);
    return this;
  };

  var buttonMouseEnter = function() {
    d3.select(this).transition().duration(200).attr("r", selectedButtonSize).style("opacity", "1.0");
  };

  var buttonMouseLeave = function() {
    d3.select(this).transition().duration(200).attr("r", buttonSize).style("opacity", "");
  };
};

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
    .classed("highlight", true)
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
gtdo.ToggleButton = function(uncheckedClass, checkedClass) {
  var self = this;
  var checked = false;
  var checkBox = undefined;
  var listener = undefined;

  /**
  * Binds this check box to a specific element, calling checkListener(boolean) when the element is clicked.
  */
  this.bind = function(selector, checkListener) {
    listener = checkListener
    checkBox = d3.select(selector)
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
