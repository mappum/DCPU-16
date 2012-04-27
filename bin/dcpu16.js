#!/usr/bin/env node

var dcpu = require('../index.js');

var cpu = new dcpu.CPU();
var assembler = new dcpu.Assembler(cpu);

var hex = process.argv.indexOf('-h') !== -1;
var fullSize = process.argv.indexOf('-f') !== -1;

var data = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', function(chunk){ data += chunk; });
process.stdin.on('end', function(){
	try {
	    assembler.compile(data);
	    
	    var lastNonzero;
	    if(!fullSize) {
		    for(var i = cpu.ramSize - 1; i >= 0; i--) {
		    	if(cpu.mem[i]) {
		    		lastNonzero = i;
		    		break;
		    	}
		    }
	    } else {
	    	lastNonzero = cpu.ramSize - 1;
	    }
	    
	    if(hex) {
	    	var string = '';
	    	for(var i = 0; i <= lastNonzero; i++) {
	    		string += dcpu.CPU.formatWord(cpu.mem[i]);
	    	}
	    	process.stdout.write(string + '\n');
	    } else {
	    	
	    	var buffer = new Buffer(lastNonzero + 1);
	    	for(var i = 0; i <= lastNonzero; i++) {
	    		buffer[i] = cpu.mem[i];
	    	}
	    	process.stdout.write(buffer.toString('ucs2') + '\n');
	    }
    } catch(e) {
    	console.error(e);
    }
});
process.stdin.resume();
