#!/bin/bash

bower install
rm -rf build/
mkdir build
cp bower_components/d3/d3.min.js build/
cp bower_components/hideseek/jquery.hideseek.min.js build/
cp bower_components/jquery/dist/jquery.min.js build/
cp -R src/* build/
