var CPU = require("../dcpu16.js").CPU;
var assert = require("assert");

module.exports = {
    'test CPU#addressFor': function() {
        // TODO
    },

    'test CPU#nextInstruction': function() {
        var cpu = new CPU();

        // SET [next word], next word
        cpu.mem[0x0000] = 0x7DE1;
        cpu.mem[0x0001] = 0x4242;
        cpu.mem[0x0002] = 0xC0C0;
        cpu.mem['pc'] = 0x0000;

        var insn = cpu.nextInstruction();
        assert.equal(insn.opcode, 0);
        assert.equal(insn.aAddr, 0x4242);
        assert.equal(insn.bAddr, 0x0002);


        cpu.mem[0x0000] = 0x0020; // BRK
        cpu.mem['pc'] = 0x0000;
        var insn = cpu.nextInstruction();
        assert.equal(insn.opcode, 17);
    },

    'test instruction length': function() {
        var cpu = new CPU();

        // SET A, B
        cpu.mem[0x0000] = 0x0401;
        cpu.mem['pc'] = 0x0000;
        cpu.nextInstruction();
        assert.equal(cpu.mem['pc'], 0x0001);

        // SET A, next word
        cpu.mem[0x0000] = 0x7C01;
        cpu.mem['pc'] = 0x0000;
        cpu.nextInstruction();
        assert.equal(cpu.mem['pc'], 0x0002);

        // SET next word, A
        cpu.mem[0x0000] = 0x01F1;
        cpu.mem['pc'] = 0x0000;
        cpu.nextInstruction();
        assert.equal(cpu.mem['pc'], 0x0002);

        // SET [next word], [next word]
        cpu.mem[0x0000] = 0x79E1;
        cpu.mem['pc'] = 0x0000;
        cpu.nextInstruction();
        assert.equal(cpu.mem['pc'], 0x0003);
    }
};
