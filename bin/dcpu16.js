#!/usr/bin/env node

var dcpu = require('dcpu16');

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
	    		buffer[i*2] = (cpu.mem[i] & 0xff);
	    		buffer[i*2+1] = (cpu.mem[i] >> 8) & 0xff;
	    	}
	    	process.stdout.write(buffer.toString('binary'));
	    }
    } catch(e) {
    	console.log('ERROR: ' + e);
    }
});
process.stdin.resume();
