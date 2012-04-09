#!/usr/bin/env node

var dcpu = require('dcpu16');

var cpu = new dcpu.CPU();
var assembler = new dcpu.Assembler(cpu);

var data = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', function(chunk){ data += chunk; });
process.stdin.on('end', function(){
	assembler.compile(data);
	for(var i = 0; i < assembler.addressMap.length - 1; i++) {
		process.stdout.write(dcpu.formatWord(cpu.mem[i]));
	}
});
process.stdin.resume();
