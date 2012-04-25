var CPU = require("../lib/cpu.js");
var assert = require("assert");

module.exports = {
    'test CPU#addressFor': function() {
        var cpu = new CPU();

        // Simple register-based values
        var registers = ["a", "b", "c", "x", "y", "z", "i", "j"];
        cpu.set(0x0000, 4);
        for (var i = 0, _len = registers.length; i < _len; ++i) {
            cpu.set("pc", 0x0000);
            cpu.set(registers[i], 0xF0F0 + i);
            cpu.set(0xF0F0 + i, 42);

            assert.equal(cpu.addressFor(i), registers[i]);
            assert.equal(cpu.addressFor(i+8), 0xF0F0 + i);
            assert.equal(cpu.addressFor(i+16), 0xF0F0 + i + 4);
        }

        assert.equal(cpu.addressFor(0x1B), "stack");
        assert.equal(cpu.addressFor(0x1C), "pc");
        assert.equal(cpu.addressFor(0x1D), "ex");

        // Encoded literals
        for (var i = -1; i < 31; ++i) {
            assert.equal(cpu.addressFor(0x21 + i), (i & 0xffff) | CPU.FLAG_LITERAL);
        }

        // Stack operations
        cpu.set("stack", 0xFFFF);
        assert.equal(cpu.addressFor(0x18), 0xFFFF);
        assert.equal(cpu.get("stack"), 0x0000);

        cpu.set("stack", 0xFFFF);
        assert.equal(cpu.addressFor(0x19), 0xFFFF);
        assert.equal(cpu.get("stack"), 0xFFFF);

        cpu.set("stack", 0xFFFF);
        assert.equal(cpu.addressFor(0x1A), 0xFFFE);
        assert.equal(cpu.get("stack"), 0xFFFE);

        // next-word value types
        cpu.set(0x0000, 0x4242);
        cpu.set("pc", 0x0000);
        assert.equal(cpu.addressFor(0x1E), 0x4242); // used as address
        cpu.set("pc", 0x0000);
        assert.equal(cpu.addressFor(0x1F), 0x4242 | CPU.FLAG_LITERAL); // used as literal
    },

    'test literal-flagged values': function() {
        var cpu = new CPU();

        // get returns unflagged value
        assert.equal(cpu.get(0x1234 | CPU.FLAG_LITERAL), 0x1234);

        // set does nothing
        cpu.set(0x1234, 0x4242);
        cpu.set(0x1234 | CPU.FLAG_LITERAL, 0xBEEF);
        assert.equal(cpu.get(0x1234), 0x4242);

        // storing a flagged literal stores the unflagged value
        cpu.set(0x1234, 0x4242 | CPU.FLAG_LITERAL);
        assert.equal(cpu.get(0x1234), 0x4242);
    },

    'test CPU#nextInstruction': function() {
        var cpu = new CPU();

        // SET [next word], next word
        cpu.set(0x0000, 0x7DE1);
        cpu.set(0x0001, 0x4242);
        cpu.set(0x0002, 0xC0C0);
        cpu.set('pc', 0x0000);

        var insn = cpu.nextInstruction();
        assert.equal(insn.opcode, 0);
        assert.equal(insn.a, 0x4242);
        assert.equal(insn.b, 0xC0C0 | CPU.FLAG_LITERAL);

        // BRK
        cpu.set(0x0000, 0x0020);
        cpu.set('pc', 0x0000);
        var insn = cpu.nextInstruction();
        assert.equal(insn.opcode, 17);
    },

    'test instruction length': function() {
        var cpu = new CPU();

        // SET A, B
        cpu.set(0x0000, 0x0401);
        cpu.set('pc', 0x0000);
        cpu.nextInstruction();
        assert.equal(cpu.get('pc'), 0x0001);

        // SET A, next word
        cpu.set(0x0000, 0x7C01);
        cpu.set('pc', 0x0000);
        cpu.nextInstruction();
        assert.equal(cpu.get('pc'), 0x0002);

        // SET next word, A
        cpu.set(0x0000, 0x01F1);
        cpu.set('pc', 0x0000);
        cpu.nextInstruction();
        assert.equal(cpu.get('pc'), 0x0002);

        // SET [next word], [next word]
        cpu.set(0x0000, 0x79E1);
        cpu.set('pc', 0x0000);
        cpu.nextInstruction();
        assert.equal(cpu.get('pc'), 0x0003);
    },

    // literal value-types must not be assignable
    'test unassignable literals': function() {
        var cpu = new CPU();

        // encoded literals
        for (var i = 0x00; i < 0x1F; ++i) {
            cpu.set('pc', 0x0000);
            cpu.set('a', i + 1000);
            cpu.set(i+1, 0x4242);

            // SET <literal i>, A
            cpu.set(0x0000, 0x0001 | ((i + 0x21) << 4));
            cpu.step();
            assert.equal(cpu.get(i+1), 0x4242);
        }

        // next-word literal
        cpu.set('pc', 0x0000);
        cpu.set('a', 0x1234);

        // SET next word, A
        cpu.set(0x0000, 0x7DE1);
        cpu.set(0x0001, 0x4242);
        cpu.step();
        assert.equal(cpu.get(0x0001), 0x4242);
    },

    // [A+0xFFFF] should have the same effect as [A-1]
    'test offset wraparound': function() {
        var cpu = new CPU();

        cpu.set('pc', 0x0000);
        cpu.set('a', 0x0042);
        cpu.set(0x0042, 0x1234);

        // SET [A+0xFFFF] 0x4321;
        cpu.set(0x0000, 0x7D01);
        cpu.set(0x0001, 0xFFFF);
        cpu.set(0x0002, 0x4321);
        cpu.step();
        assert.equal(cpu.get(0x0042), 0x1234);
        assert.equal(cpu.get(0x0041), 0x4321);
    }
};
