var CPU = require("../dcpu16.js").CPU;
var assert = require("assert");

module.exports = {
    'test CPU#addressFor': function() {
        var cpu = new CPU();
        var registers = ["a", "b", "c", "x", "y", "z", "i", "j"];

        cpu.set(0x0000, 4);
        for (var i = 0, _len = registers.length; i < _len; ++i) {
            cpu.set("pc", 0x0000);
            cpu.set(registers[i], 0xF0F0 + i);
            cpu.set(0xF0F0 + i, 42);

            assert(cpu.addressFor(i), registers[i]);
            assert(cpu.addressFor(i+8), 0xF0F0 + i);
            assert(cpu.addressFor(i+16), 42);
        }

        // TODO: rest of the value types
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

        // BRK
        cpu.mem[0x0000] = 0x0020;
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
