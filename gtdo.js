"use strict";
var gtdo = gtdo || {};

gtdo.common = {
  assignOrdinals: function(data) {
    var ord = 0;
    for (var i = 0; i < data.length; i++) data[i].ord = ord++;
  }
}

gtdo.ListView = function() {
  var itemHeight = 100;
  var bar = null;

  this.apply = function(containerSelector, data) {
    var tasks = d3.select(containerSelector)
    .attr("width", "100%")
    .attr("height", "100%");

    gtdo.common.assignOrdinals(data);

    bar = tasks.selectAll("g")
    .data(data, function(d) { return d.ord; })
    .enter().append("g")
    .each(setPosition)
    .call(moveToNow);

    bar.append("rect")
    .attr("width", 200 )
    .attr("height", itemHeight-1);

    bar.append("text")
    .attr("x", 10 )
    .attr("y", itemHeight / 2)
    .attr("dy", ".35em")
    .text(function(d) { return d.title });

    bar.call(d3.behavior.drag()
    .on("dragstart", dragstart)
    .on("drag", dragVertical)
    .on("dragend", dragend));
  };

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

      bar.filter(function(di) { return di === d ? null : di })
      .each(setPosition)
      .call(moveToSmooth);
    } else {
      d3.select(this).call(moveToNow);
    }
  };
}
