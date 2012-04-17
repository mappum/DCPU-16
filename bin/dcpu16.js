#!/usr/bin/env node
var DCPU = require('../index.js');

var cpu = new DCPU.CPU();
var assembler = new DCPU.Assembler(cpu);

var data = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', function(chunk){ data += chunk; });
process.stdin.on('end', function(){
    assembler.compile(data);
    for(var i = 0; i < assembler.addressMap.length - 1; i++) {
        process.stdout.write(cpu.mem[i].toString(16) + " ");
    }
    process.stdout.write("\n");
});
process.stdin.resume();
