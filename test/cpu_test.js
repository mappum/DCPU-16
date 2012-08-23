var Assembler = require("assembler");
var CPU = require("cpu");
var assert = require("assert");

function assembleOnCpu(cpu, lines) {
    var assembler = new Assembler(cpu);
    var code = lines.join("\n");
    assembler.compile(code + "\n BRK");
}
function runOnCpu() {
    var cpu = new CPU();
    assembleOnCpu(cpu, Array.prototype.slice.call(arguments, 0));
    cpu.run();
    return cpu;
}

module.exports = {
    'test CPU#addressFor': function() {
        var cpu = new CPU();

        // Simple register-based values
        var registers = ["a", "b", "c", "x", "y", "z", "i", "j"];
        cpu.set(0x0000, 4);
        for (var i = 0, _len = registers.length; i < _len; ++i) {
            cpu.set("pc", 0x0000);
            cpu.set(registers[i], 0xF0F0 + i);

            assert.equal(cpu.addressFor(i), registers[i]);
            assert.equal(cpu.addressFor(i+8), 0xF0F0 + i);
            assert.equal(cpu.addressFor(i+16), 0xF0F0 + i + 4);
        }

        assert.equal(cpu.addressFor(0x1B), "sp");
        assert.equal(cpu.addressFor(0x1C), "pc");
        assert.equal(cpu.addressFor(0x1D), "ex");

        // Encoded literals
        for (i = -1; i < 31; ++i) {
            assert.equal(cpu.addressFor(0x21 + i), (i & 0xffff) | CPU.FLAG_LITERAL);
        }

        // Stack operations
        // Push
        cpu.set("sp", 0xFFFF);
        assert.equal(cpu.addressFor(0x18, false), 0xFFFE);
        assert.equal(cpu.get("sp"), 0xFFFE);

        // Pop
        cpu.set("sp", 0xFFFF);
        assert.equal(cpu.addressFor(0x18, true), 0xFFFF);
        assert.equal(cpu.get("sp"), 0x0000);

        // Peek
        cpu.set("sp", 0xFFFF);
        assert.equal(cpu.addressFor(0x19), 0xFFFF);
        assert.equal(cpu.get("sp"), 0xFFFF);

        // Pick
        cpu.set("sp", 0xFFFF);
        cpu.set(0x0000, 0xFFFF);
        cpu.set("pc", 0x0000);
        assert.equal(cpu.addressFor(0x1A), 0xFFFE);
        assert.equal(cpu.get("sp"), 0xFFFF);

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
        cpu.set(0x0000, 0x7FC1);
        cpu.set(0x0001, 0x4242);
        cpu.set(0x0002, 0xC0C0);
        cpu.set('pc', 0x0000);

        var insn = cpu.nextInstruction();
        assert.equal(insn.opcode, 1);
        assert.equal(insn.a, 0x4242 | CPU.FLAG_LITERAL);
        assert.equal(insn.b, 0xC0C0);

        // BRK
        cpu.set(0x0000, 0x0020);
        cpu.set('pc', 0x0000);
        insn = cpu.nextInstruction();
        assert.equal(insn.opcode, 32);
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
        cpu.set(0x0000, 0x03E1);
        cpu.set('pc', 0x0000);
        cpu.nextInstruction();
        assert.equal(cpu.get('pc'), 0x0002);

        // SET [next word], [next word]
        cpu.set(0x0000, 0x7BC1);
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
        cpu.set(0x0000, 0x7E01);
        cpu.set(0x0001, 0x4321);
        cpu.set(0x0002, 0xFFFF);
        cpu.step();
        assert.equal(cpu.get(0x0042), 0x1234);
        assert.equal(cpu.get(0x0041), 0x4321);
    },

    'CPU#get("pop") should behave as the corresponding argument': function () {
        var cpu = new CPU();

        cpu.set("sp", 0xffff);
        cpu.set(0xffff, 0x0042);

        assert.equal(cpu.get("pop"), 0x0042);
        assert.equal(cpu.get("sp"), 0x0000);
    },

    'CPU#set("push") should behave as the corresponding argument': function () {
        var cpu = new CPU();

        cpu.set("push", 0x0042);

        assert.equal(cpu.get(0xffff), 0x0042);
        assert.equal(cpu.get("sp"), 0xffff);
    },

    'BRK should take zero cycles to perform': function () {
        var cpu = runOnCpu("BRK");
        assert.equal(cpu.cycle, 0);
    },

    'SET should store its source in its destination': function () {
        var cpu = runOnCpu("SET a, 1");
        assert.equal(cpu.get("a"), 1);
    },

    'SET with no next word values should take one cycle to perform': function () {
        var cpu = runOnCpu("SET a, 1");
        assert.equal(cpu.cycle, 1);
    },

    'SET with one next word value should take one extra cycle to perform': function () {
        var cpu = runOnCpu("SET a, 0x1000");
        assert.equal(cpu.cycle, 1 + 1);
    },

    'SET with two next word values should take two extra cycles to perform': function () {
        var cpu = runOnCpu("SET [0x1000], 0x1000");
        assert.equal(cpu.cycle, 1 + 1 + 1);
    },

    'ADD without overflow should put sum in destination and zero in EX': function () {
        var cpu = runOnCpu("SET a, 1",
                           "ADD a, 2");
        assert.equal(cpu.get("a"), 3);
        assert.equal(cpu.get("ex"), 0);
    },

    'ADD with overflow should put truncated sum in destination and one in EX': function () {
        var cpu = runOnCpu("SET a, 0xffff",
                           "ADD a, 0xffff");
        assert.equal(cpu.get("a"), 0xfffe);
        assert.equal(cpu.get("ex"), 1);
    },

    'ADD with no next word values should take two cycles to perform': function () {
        var cpu = runOnCpu("ADD a, 1");
        assert.equal(cpu.cycle, 2);
    },

    'SUB without underflow should put difference in destination and zero in EX': function () {
        var cpu = runOnCpu("SET a, 2",
                           "SUB a, 1");
        assert.equal(cpu.get("a"), 1);
        assert.equal(cpu.get("ex"), 0);
    },

    'SUB with underflow should put truncated difference in destination and -1 in EX': function () {
        var cpu = runOnCpu("SET a, 1",
                           "SUB a, 2");
        assert.equal(cpu.get("a"), 0xffff);
        assert.equal(cpu.get("ex"), 0xffff);
    },

    'SUB with no next word values should take two cycles to perform': function () {
        var cpu = runOnCpu("SUB a, 1");
        assert.equal(cpu.cycle, 2);
    },

    'MUL without overflow should put product in destination and zero in EX': function () {
        var cpu = runOnCpu("SET a, 2",
                           "MUL a, 2");
        assert.equal(cpu.get("a"), 4);
        assert.equal(cpu.get("ex"), 0);
    },

    'MUL with overflow should put lower bits of product in destination and higher bits in EX': function () {
        var cpu = runOnCpu("SET a, 0x8000",
                           "MUL a, 0x8000");
        assert.equal(cpu.get("a"), 0);
        assert.equal(cpu.get("ex"), 0x4000);
    },

    'MUL with no next word values should take two cycles to perform': function () {
        var cpu = runOnCpu("MUL a, 1");
        assert.equal(cpu.cycle, 2);
    },

    'MLI without underflow should put product in destination and zero in EX': function () {
        var cpu = runOnCpu("SET a, 0xfffe",
                           "MLI a, 0xfffe");
        assert.equal(cpu.get("a"), 4);
        assert.equal(cpu.get("ex"), 0);
    },

    'MLI with underflow should put lower bits of product in destination and higher bits in EX': function () {
        var cpu = runOnCpu("SET a, 0xfffe",
                           "MLI a, 2");
        assert.equal(cpu.get("a"), 0xfffc);
        assert.equal(cpu.get("ex"), 0xffff);
    },

    'MLI with overflow should put lower bits of product in destination and higher bits in EX': function () {
        var cpu = runOnCpu("SET a, 0x4000",
                           "MLI a, 0x10");
        assert.equal(cpu.get("a"), 0);
        assert.equal(cpu.get("ex"), 4);
    },

    'MLI with no next word values should take two cycles to perform': function () {
        var cpu = runOnCpu("MLI a, 1");
        assert.equal(cpu.cycle, 2);
    },

    'DIV by zero should put zero in destination and EX': function () {
        var cpu = runOnCpu("SET a, 2",
                           "DIV a, 0");
        assert.equal(cpu.get("a"), 0);
        assert.equal(cpu.get("ex"), 0);
    },

    'DIV by nonzero should put quotient in destination and fractional part in EX': function () {
        var cpu = runOnCpu("SET a, 0x8001",
                           "DIV a, 2");
        assert.equal(cpu.get("a"), 0x4000);
        assert.equal(cpu.get("ex"), 0x8000);
    },

    'DIV number larger than 0x7fff by nonzero should put fractional part in EX': function () {
        // 0xFFFF / 0xD == 0x13B1.27627
        var cpu = runOnCpu("SET a, 0xffff",
                           "DIV a, 0xd");
        assert.equal(cpu.get("a"), 0x13b1);
        assert.equal(cpu.get("ex"), 0x2762);
    },

    'DIV number by nonzero should put fractional part rounded towards zero in EX': function () {
        // 0x7FFF / 0x7F01 == 0x1.01FFFBF8
        var cpu = runOnCpu("SET a, 0x7fff",
                           "DIV a, 0x7f01");
        assert.equal(cpu.get("a"), 1);
        assert.equal(cpu.get("ex"), 0x01ff);
    },

    'DIV with no next word values should take three cycles to perform': function () {
        var cpu = runOnCpu("DIV a, 1");
        assert.equal(cpu.cycle, 3);
    },

    'DVI by zero should put zero in destination and EX': function () {
        var cpu = runOnCpu("SET a, 2",
                           "DVI a, 0");
        assert.equal(cpu.get("a"), 0);
        assert.equal(cpu.get("ex"), 0);
    },

    'DVI by nonzero should put quotient in destination and fractional part in EX': function () {
        // -0x9 / -0x4 == 0x2.4
        var cpu = runOnCpu("SET a, 0xfff7",
                           "DVI a, 0xfffc");
        assert.equal(cpu.get("a"), 2);
        assert.equal(cpu.get("ex"), 0x4000);
    },

    'DVI negative number by nonzero should round quotitient towards zero': function () {
        // -0x7FFF / 2 == -0x3fff.8
        var cpu = runOnCpu("SET a, 0x8001",
                           "DVI a, 0x2");
        assert.equal(cpu.get("a"), 0xc001);
        assert.equal(cpu.get("ex"), 0x8000);
    },

    'DVI with no next word values should take three cycles to perform': function () {
        var cpu = runOnCpu("DVI a, 1");
        assert.equal(cpu.cycle, 3);
    },

    'MOD by zero should put zero in destination': function () {
        var cpu = runOnCpu("SET a, 2",
                           "MOD a, 0");
        assert.equal(cpu.get("a"), 0);
    },

    'MOD by nonzero should put modulus in destination': function () {
        var cpu = runOnCpu("SET a, 7",
                           "MOD a, 2");
        assert.equal(cpu.get("a"), 1);
    },

    'MOD with no next word values should take three cycles to perform': function () {
        var cpu = runOnCpu("MOD a, 1");
        assert.equal(cpu.cycle, 3);
    },

    'MDI by zero should put zero in destination': function () {
        var cpu = runOnCpu("SET a, 2",
                           "MDI a, 0");
        assert.equal(cpu.get("a"), 0);
    },

    'MDI by nonzero should put modulus in destination': function () {
        var cpu = runOnCpu("SET a, 0xfff9",
                           "MDI a, 2");
        assert.equal(cpu.get("a"), 0xffff);
    },

    'MDI with no next word values should take three cycles to perform': function () {
        var cpu = runOnCpu("MDI a, 1");
        assert.equal(cpu.cycle, 3);
    },

    'AND should put bitwise and in destination': function () {
        var cpu = runOnCpu("SET a, 0x0fff",
                           "AND a, 0xffF0");
        assert.equal(cpu.get("a"), 0x0ff0);
    },

    'AND with no next word values should take one cycle to perform': function () {
        var cpu = runOnCpu("AND a, 1");
        assert.equal(cpu.cycle, 1);
    },

    'BOR should put bitwise or in destination': function () {
        var cpu = runOnCpu("SET a, 0xf000",
                           "BOR a, 0x000f");
        assert.equal(cpu.get("a"), 0xf00f);
    },

    'BOR with no next word values should take one cycle to perform': function () {
        var cpu = runOnCpu("BOR a, 1");
        assert.equal(cpu.cycle, 1);
    },

    'XOR should put bitwise exclusive or in destination': function () {
        var cpu = runOnCpu("SET a, 0xfff0",
                           "XOR a, 0x0fff");
        assert.equal(cpu.get("a"), 0xf00f);
    },

    'XOR with no next word values should take one cycle to perform': function () {
        var cpu = runOnCpu("XOR a, 1");
        assert.equal(cpu.cycle, 1);
    },

    'SHR should shift bits right while zero padding and put bits shifted out of the result in EX': function () {
        var cpu = runOnCpu("SET a, 0xffff",
                           "SHR a, 8");
        assert.equal(cpu.get("a"), 0x00ff);
        assert.equal(cpu.get("ex"), 0xff00);
    },

    'SHR with no next word values should take one cycle to perform': function () {
        var cpu = runOnCpu("SHR a, 1");
        assert.equal(cpu.cycle, 1);
    },

    'ASR should shift bits right while sign extending positive numbers and put bits shifted out of the result in EX': function () {
        var cpu = runOnCpu("SET a, 0x7fff",
                           "ASR a, 8");
        assert.equal(cpu.get("a"), 0x007f);
        assert.equal(cpu.get("ex"), 0xff00);
    },

    'ASR should shift bits right while sign extending negative numbers and put bits shifted out of the result in EX': function () {
        var cpu = runOnCpu("SET a, 0xffff",
                           "ASR a, 8");
        assert.equal(cpu.get("a"), 0xffff);
        assert.equal(cpu.get("ex"), 0xff00);
    },

    'ASR with no next word values should take one cycle to perform': function () {
        var cpu = runOnCpu("ASR a, 1");
        assert.equal(cpu.cycle, 1);
    },

    'SHL should shift bits left and put bits shifted out of the result in EX': function () {
        var cpu = runOnCpu("SET a, 0xffff",
                           "SHL a, 8");
        assert.equal(cpu.get("a"), 0xff00);
        assert.equal(cpu.get("ex"), 0x00ff);
    },

    'SHL with no next word values should take one cycle to perform': function () {
        var cpu = runOnCpu("SHL a, 1");
        assert.equal(cpu.cycle, 1);
    },

    'IFB should proceed to the following instruction when bitwise and of its values is nonzero': function () {
        var cpu = runOnCpu("IFB 6, 3",
                           "SET x, 1");
        assert.equal(cpu.get("x"), 1);
    },

    'IFB with a true condition and one next word value should take three cycles to perform not including its next instruction': function () {
        var cpu = runOnCpu("IFB 6, 3",
                           "SET x, 1");
        assert.equal(cpu.cycle, (2 + 1) + 1);
    },

    'IFB should skip the following instruction when bitwise and of its values is zero': function () {
        var cpu = runOnCpu("IFB 4, 3",
                           "SET x, 1");
        assert.equal(cpu.get("x"), 0);
    },

    'IFB with a false condition and one next word value should take three cycles to perform plus one for each skipped instruction': function () {
        var cpu = runOnCpu("IFB 4, 3",
                           "SET x, 1");
        assert.equal(cpu.cycle, (2 + 1) + 1);
    },

    'IFC should proceed to the following instruction when bitwise and of its values is zero': function () {
        var cpu = runOnCpu("IFC 4, 3",
                           "SET x, 1");
        assert.equal(cpu.get("x"), 1);
    },

    'IFC with a true condition and one next word value should take three cycles to perform not including its next instruction': function () {
        var cpu = runOnCpu("IFC 4, 3",
                           "SET x, 1");
        assert.equal(cpu.cycle, (2 + 1) + 1);
    },

    'IFC should skip the following instruction when bitwise and of its values is nonzero': function () {
        var cpu = runOnCpu("IFC 6, 3",
                           "SET x, 1");
        assert.equal(cpu.get("x"), 0);
    },

    'IFC with a false condition and one next word value should take three cycles to perform plus one for each skipped instruction': function () {
        var cpu = runOnCpu("IFC 6, 3",
                           "SET x, 1");
        assert.equal(cpu.cycle, (2 + 1) + 1);
    },

    'IFE should proceed to the following instruction when its values are equal': function () {
        var cpu = runOnCpu("IFE 6, 6",
                           "SET x, 1");
        assert.equal(cpu.get("x"), 1);
    },

    'IFE with a true condition and one next word value should take three cycles to perform not including its next instruction': function () {
        var cpu = runOnCpu("IFE 6, 6",
                           "SET x, 1");
        assert.equal(cpu.cycle, (2 + 1) + 1);
    },

    'IFE should skip the following instruction when it values are not equal': function () {
        var cpu = runOnCpu("IFE 6, 3",
                           "SET x, 1");
        assert.equal(cpu.get("x"), 0);
    },

    'IFE with a false condition and one next word value should take three cycles to perform plus one for each skipped instruction': function () {
        var cpu = runOnCpu("IFE 6, 3",
                           "SET x, 1");
        assert.equal(cpu.cycle, (2 + 1) + 1);
    },

    'IFN should proceed to the following instruction when its values are not equal': function () {
        var cpu = runOnCpu("IFN 6, 3",
                           "SET x, 1");
        assert.equal(cpu.get("x"), 1);
    },

    'IFN with a true condition and one next word value should take three cycles to perform not including its next instruction': function () {
        var cpu = runOnCpu("IFN 6, 3",
                           "SET x, 1");
        assert.equal(cpu.cycle, (2 + 1) + 1);
    },

    'IFN should skip the following instruction when it values are equal': function () {
        var cpu = runOnCpu("IFN 6, 6",
                           "SET x, 1");
        assert.equal(cpu.get("x"), 0);
    },

    'IFN with a false condition and one next word value should take three cycles to perform plus one for each skipped instruction': function () {
        var cpu = runOnCpu("IFN 6, 6",
                           "SET x, 1");
        assert.equal(cpu.cycle, (2 + 1) + 1);
    },

    'IFG should proceed to the following instruction when its unsigned b value is greater than its unsigned a value': function () {
        var cpu = runOnCpu("IFG 0x8000, 0x7fff",
                           "SET x, 1");
        assert.equal(cpu.get("x"), 1);
    },

    'IFG with a true condition and two next word values should take four cycles to perform not including its next instruction': function () {
        var cpu = runOnCpu("IFG 0x8000, 0x7fff",
                           "SET x, 1");
        assert.equal(cpu.cycle, 5);
    },

    'IFG should skip the following instruction when its unsigned b value is less than or equal to its unsigned a value': function () {
        var cpu = runOnCpu("IFG 0x8000, 0x8000",
                           "SET x, 1");
        assert.equal(cpu.get("x"), 0);
    },

    'IFG with a false condition and two next word values should take four cycles to perform plus one for each skipped instruction': function () {
        var cpu = runOnCpu("IFG 0x8000, 0x8000",
                           "SET x, 1");
        assert.equal(cpu.cycle, 5);
    },

    'IFA should proceed to the following instruction when its signed b value is greater than its signed a value': function () {
        var cpu = runOnCpu("IFA 0x7fff, 0x8000",
                           "SET x, 1");
        assert.equal(cpu.get("x"), 1);
    },

    'IFA with a true condition and two next word values should take four cycles to perform not including its next instruction': function () {
        var cpu = runOnCpu("IFA 0x7fff, 0x8000",
                           "SET x, 1");
        assert.equal(cpu.cycle, 5);
    },

    'IFA should skip the following instruction when its signed b value is less than or equal to its signed a value': function () {
        var cpu = runOnCpu("IFA 0x7fff, 0x7fff",
                           "SET x, 1");
        assert.equal(cpu.get("x"), 0);
    },

    'IFA with a false condition and two next word values should take four cycles to perform plus one for each skipped instruction': function () {
        var cpu = runOnCpu("IFA 0x7fff, 0x7fff",
                           "SET x, 1");
        assert.equal(cpu.cycle, 5);
    },

    'IFL should proceed to the following instruction when its unsigned b value is less than its unsigned a value': function () {
        var cpu = runOnCpu("IFL 0x7fff, 0x8000",
                           "SET x, 1");
        assert.equal(cpu.get("x"), 1);
    },

    'IFL with a true condition and two next word values should take four cycles to perform not including its next instruction': function () {
        var cpu = runOnCpu("IFL 0x7fff, 0x8000",
                           "SET x, 1");
        assert.equal(cpu.cycle, 5);
    },

    'IFL should skip the following instruction when its unsigned b value is greater than or equal to its unsigned a value': function () {
        var cpu = runOnCpu("IFL 0x7fff, 0x7fff",
                           "SET x, 1");
        assert.equal(cpu.get("x"), 0);
    },

    'IFL with a false condition and two next word values should take four cycles to perform plus one for each skipped instruction': function () {
        var cpu = runOnCpu("IFL 0x7fff, 0x7fff",
                           "SET x, 1");
        assert.equal(cpu.cycle, 5);
    },

    'IFU should proceed to the following instruction when its signed b value is less than its signed a value': function () {
        var cpu = runOnCpu("IFU 0x8000, 0x7fff",
                           "SET x, 1");
        assert.equal(cpu.get("x"), 1);
    },

    'IFU with a true condition and two next word values should take four cycles to perform not including its next instruction': function () {
        var cpu = runOnCpu("IFU 0x8000, 0x7fff",
                           "SET x, 1");
        assert.equal(cpu.cycle, 5);
    },

    'IFU should skip the following instruction when its signed b value is greater than or equal to its signed a value': function () {
        var cpu = runOnCpu("IFU 0x8000, 0x8000",
                           "SET x, 1");
        assert.equal(cpu.get("x"), 0);
    },

    'IFU with a false condition and two next word values should take four cycles to perform plus one for each skipped instruction': function () {
        var cpu = runOnCpu("IFU 0x8000, 0x8000",
                           "SET x, 1");
        assert.equal(cpu.cycle, 5);
    },

    'When a conditional skips another conditional instruction an additional instruction should be skipped': function () {
        var cpu = runOnCpu("IFE 1, 2",
                           "IFE 1, 1",
                           "IFE 1, 1",
                           "SET x, 1",
                           "SET y, 1");
        assert.equal(cpu.get("x"), 0);
        assert.equal(cpu.get("y"), 1);
    },

    'Each skipped conditional instruction should add just one cycle': function () {
        var cpu = runOnCpu("IFE 1, 2",
                           "IFE 1, 1",
                           "IFE 1, 1",
                           "SET x, 1");
        assert.equal(cpu.cycle, (2 + 1) + 1 + 1 + 1);
    },

    'An instruction skipped by a conditional should only add one cycle, independent of its size': function () {
        var cpu = runOnCpu("IFE 1, 2",
                           "SET [0x1000], 0x1000");
        assert.equal(cpu.cycle, (2 + 1) + 1);
    },

    'ADX without overflow should put sum in destination and zero in EX': function () {
        var cpu = runOnCpu("SET a, 1",
                           "SET ex, 1",
                           "ADX a, 2");
        assert.equal(cpu.get("a"), 4);
        assert.equal(cpu.get("ex"), 0);
    },

    'ADX with overflow should put truncated sum in destination and one in EX': function () {
        var cpu = runOnCpu("SET a, 0xffff",
                           "SET ex, 1",
                           "ADX a, 1");
        assert.equal(cpu.get("a"), 1);
        assert.equal(cpu.get("ex"), 1);
    },

    'ADX with overflow should put truncated sum in destination and one in EX, even if overflow is 2': function () {
        var cpu = runOnCpu("SET a, 0xffff",
                           "SET ex, 0xffff",
                           "ADX a, 3");
        assert.equal(cpu.get("a"), 1);
        assert.equal(cpu.get("ex"), 1);
    },

    'ADX with no next word values should take three cycles to perform': function () {
        var cpu = runOnCpu("ADX a, 1");
        assert.equal(cpu.cycle, 3);
    },

    'SBX without underflow should put difference in destination and zero in EX': function () {
        var cpu = runOnCpu("SET a, 3",
                           "SET ex, 0xffff",
                           "SBX a, 1");
        assert.equal(cpu.get("a"), 1);
        assert.equal(cpu.get("ex"), 0);
    },

    'SBX with underflow should put truncated difference in destination and -1 in EX': function () {
        var cpu = runOnCpu("SET a, 1",
                           "SET ex, 0xffff",
                           "SBX a, 1");
        assert.equal(cpu.get("a"), 0xffff);
        assert.equal(cpu.get("ex"), 0xffff);
    },

    'SBX with no next word values should take three cycles to perform': function () {
        var cpu = runOnCpu("SBX a, 1");
        assert.equal(cpu.cycle, 3);
    },

    'STI should store its source in its destination and then increase I and J by one': function () {
        var cpu = runOnCpu("SET [0x1000], 0x42",
                           "SET i, 0x1000",
                           "SET j, 0x2000",
                           "STI [j], [i]");
        assert.equal(cpu.get(0x2000), 0x42);
        assert.equal(cpu.get("i"), 0x1001);
        assert.equal(cpu.get("j"), 0x2001);
    },

    'STI with no next word values should take two cycles to perform': function () {
        var cpu = runOnCpu("STI a, 1");
        assert.equal(cpu.cycle, 2);
    },

    'STD should stoure its source in its destination and then decrease I and J by one': function () {
        var cpu = runOnCpu("SET [0x1000], 0x42",
                           "SET i, 0x1000",
                           "SET j, 0x2000",
                           "STD [j], [i]");
        assert.equal(cpu.get(0x2000), 0x42);
        assert.equal(cpu.get("i"), 0x0fff);
        assert.equal(cpu.get("j"), 0x1fff);
    },

    'STD with no next word values should take two cycles to perform': function () {
        var cpu = runOnCpu("STD a, 1");
        assert.equal(cpu.cycle, 2);
    },

    'JSR should push PC and jump to its value': function () {
        var cpu = runOnCpu("JSR 0x10",
                           "SET x, 1",
                           ".ORG 0x10",
                           "SET y, 1");
        assert.equal(cpu.get("x"), 0);
        assert.equal(cpu.get("y"), 1);
        assert.equal(cpu.get("pop"), 1);
    },

    'JSR with no next word value should take three cycles to perform': function () {
        var cpu = runOnCpu("JSR 0x10");
        assert.equal(cpu.cycle, 3);
    },

    'A zero IA value should not be considered an interrupt handler, and then INT should do nothing': function () {
        var cpu = runOnCpu("ADD x, 1",
                           "IFE x, 1",
                           "INT 0x42");
        assert.equal(cpu.get("x"), 1);
        assert.equal(cpu.get("a"), 0);
        assert.equal(cpu.get("ia"), 0);
    },

    'INT with no next word value should take four cycles to perform when IA is zero': function () {
        var cpu = runOnCpu("INT 1");
        assert.equal(cpu.cycle, 4);
    },

    'IAG should get the value of IA': function () {
        var cpu = runOnCpu("IAS 0x42",
                           "IAG a");
        assert.equal(cpu.get("a"), 0x42);
    },

    'IAG with no next word value should take one cycle to perform': function () {
        var cpu = runOnCpu("IAG a");
        assert.equal(cpu.cycle, 1);
    },

    'IAS should set the value of IA': function () {
        var cpu = runOnCpu("IAS 0x42");
        assert.equal(cpu.get("ia"), 0x42);
    },

    'IAS with no next word value should take one cycle to perform': function () {
        var cpu = runOnCpu("IAS 0");
        assert.equal(cpu.cycle, 1);
    },

    'a nonzero IA value should be considered an interrupt handler, and then INT should trigger an interrupt': function () {
        var cpu = runOnCpu("IAS 0x10",
                           "INT 3",
                           "SET x, 1",
                           ".ORG 0x10",
                           "SET y, 1");
        assert.equal(cpu.get("x"), 0);
        assert.equal(cpu.get("y"), 1);
        assert.equal(cpu.get("a"), 3);
        assert.equal(cpu.get("pop"), 0);
        assert.equal(cpu.get("pop"), 2);
    },

    'INT with no next word value should take four cycles to perform when IA is nonzero': function () {
        var cpu = runOnCpu("IAS 0x10",
                           "INT 1",
                           ".ORG 0x10");
        assert.equal(cpu.cycle, (1 + 4));
    },

    'the value of A should be preserved when returning from an interrupt': function () {
        var cpu = runOnCpu("IAS handler",
                           "INT 3",
                           "SET x, 1",
                           "BRK",
                           "handler:",
                           "SET y, 1",
                           "RFI z");
        assert.equal(cpu.get("x"), 1);
        assert.equal(cpu.get("y"), 1);
        assert.equal(cpu.get("a"), 0);
    },

    'RFI with no next word value should take three cycles to perform': function () {
        var cpu = runOnCpu("IAS 0x10",
                           "INT 3",
                           "BRK",
                           ".ORG 0x10",
                           "RFI z");
        assert.equal(cpu.cycle, 1 + 4 + 3);
    },

    'interrupts should be queued while handling other interrupts': function () {
        var cpu = runOnCpu("IAS handler",
                           "INT 0",
                           "SET a, a",
                           "SET x, b",
                           "BRK",
                           "handler:",
                           "ADD b, 1",
                           "IFN b, 1",
                           "SET pc, noNestedInterrupt",
                           "INT 0",
                           "SET y, b",
                           "noNestedInterrupt:",
                           "RFI z");
        assert.equal(cpu.get("x"), 2);
        assert.equal(cpu.get("y"), 1);
    },

    'queued interrupts should be ignored when triggered if IA is zero': function () {
        var cpu = runOnCpu("IFN b, 0",
                           "BRK",
                           "IAS handler",
                           "INT 0",
                           "SET x, b",
                           "BRK",
                           "handler:",
                           "ADD b, 1",
                           "IFN b, 1",
                           "SET pc, noNestedInterrupt",
                           "INT 0",
                           "SET y, b",
                           "IAS 0",
                           "noNestedInterrupt:",
                           "RFI z");
        assert.equal(cpu.get("x"), 1);
        assert.equal(cpu.get("y"), 1);
    },

    'The DCPU-16 should catch fire if more that 256 interrupts are queued': function () {
        assert.throws(function () { runOnCpu("IAS handler",
                                             "INT 3",
                                             "handler:",
                                             "SET a, 0x101",
                                             "loop:",
                                             "INT 0",
                                             "SUB a, 1",
                                             "IFN a, 0",
                                             "SET pc, loop",
                                             "SET x, 1"); }, /fire/);
    },

    'IAQ with a nonzero value should start interrupt queueing outside of an interrupt handler': function () {
        var cpu = runOnCpu("IAS handler",
                           "IAQ 1",
                           "INT 0",
                           "SET x, b",
                           "BRK",
                           "handler:",
                           "SET b, 1",
                           "RFI z");
        assert.equal(cpu.get("x"), 0);
    },

    'IAQ with a zero value should not start interrupt queueing': function () {
        var cpu = runOnCpu("IAS handler",
                           "IAQ 0",
                           "INT 0",
                           "SET x, b",
                           "BRK",
                           "handler:",
                           "SET b, 1",
                           "RFI z");
        assert.equal(cpu.get("x"), 1);
    },

    'IAQ with a zero value should stop interrupt queueing': function () {
        var cpu = runOnCpu("IAS handler",
                           "IAQ 1",
                           "INT 0",
                           "SET x, b",
                           "IAQ 0",
                           "SET y, b",
                           "BRK",
                           "handler:",
                           "SET b, 1",
                           "RFI z");
        assert.equal(cpu.get("x"), 0);
        assert.equal(cpu.get("y"), 1);
    },

    'IAQ with no next word value should take two cycles to perform': function () {
        var cpu = runOnCpu("IAQ 0");
        assert.equal(cpu.cycle, 2);
    },

    'At most one interrupt should be triggered between each instruction': function () {
        var cpu = runOnCpu("IAS handler",
                           "IAQ 1",
                           "INT 0",
                           "INT 0",
                           "INT 0",
                           "IAQ 0",
                           "SET x, b",
                           "SET y, b",
                           "SET z, b",
                           "BRK",
                           "handler:",
                           "ADD b, 1",
                           "RFI z");
        assert.equal(cpu.get("x"), 1);
        assert.equal(cpu.get("y"), 2);
        assert.equal(cpu.get("z"), 3);
    },

    'HWN should store a zero when no hardware is connected': function () {
        var cpu = runOnCpu("SET a, 1",
                           "HWN a");
        assert.equal(cpu.get("a"), 0);
    },

    'HWN should store a one when one external hardware device is connected': function () {
        var cpu = new CPU();
        cpu.addDevice({ id: 0x11112222, version: 0x3333, manufacturer: 0x44445555 });
        assembleOnCpu(cpu, ["HWN a"]);
        cpu.run();
        assert.equal(cpu.get("a"), 1);
    },

    'HWN with no next word value should take two cycles to perform': function () {
        var cpu = runOnCpu("HWN a");
        assert.equal(cpu.cycle, 2);
    },

    'HWQ should store device information in the proper registers': function () {
        var cpu = new CPU();
        cpu.addDevice({ id: 0x11112222, version: 0x3333, manufacturer: 0x44445555 });
        assembleOnCpu(cpu, ["HWQ 0"]);
        cpu.run();
        assert.equal(cpu.get("a"), 0x2222);
        assert.equal(cpu.get("b"), 0x1111);
        assert.equal(cpu.get("c"), 0x3333);
        assert.equal(cpu.get("x"), 0x5555);
        assert.equal(cpu.get("y"), 0x4444);
    },

    'HWQ with no next word value should take four cycles to perform': function () {
        var cpu = new CPU();
        cpu.addDevice({ id: 0x11112222, version: 0x3333, manufacturer: 0x44445555 });
        assembleOnCpu(cpu, ["HWQ 0"]);
        cpu.run();
        assert.equal(cpu.cycle, 4);
    },

    'HWI should call the interrupt handler of the device': function () {
        var hardwareInterruptCalled = false;
        var cpu = new CPU();
        cpu.addDevice({ id: 0x11112222,
                        version: 0x3333,
                        manufacturer: 0x44445555,
                        onInterrupt: function (onFinish) { hardwareInterruptCalled = true; } });
        assembleOnCpu(cpu, ["HWI 0"]);
        cpu.run();
        assert.equal(hardwareInterruptCalled, true);
    },

    'HWI with no next word value should take four cycles to perform plus any cycles added by the interrupt handler': function () {
        var cpu = new CPU();
        cpu.addDevice({ id: 0x11112222,
                        version: 0x3333,
                        manufacturer: 0x44445555,
                        onInterrupt: function (onFinish) { } });
        assembleOnCpu(cpu, ["HWI 0"]);
        cpu.run();
        assert.equal(cpu.cycle, 4);
    },

    'invalid instructions should stop the CPU with an exception': function () {
        assert.throws(function () { runOnCpu("DAT 0x18"); }, /invalid/);
    },

    'extended opcode zero should stop the CPU without an exception': function () {
        var cpu = runOnCpu("DAT 0",
                           "SET a, 1");
        assert.equal(cpu.get("a"), 0);
    },

    'CPU#load should load data into memory': function () {
        var cpu = new CPU();
        cpu.load([1, 2]);
        assert.eql(cpu.mem.slice(0, 2), [1, 2]);
    },

    'CPU#load should load data into memory at a specified origin': function () {
        var cpu = new CPU();
        cpu.load([1, 2], 2);
        assert.eql(cpu.mem.slice(0, 4), [0, 0, 1, 2]);
    },

    'register A should be shown by CPU#getDump': function () {
        var cpu = new CPU();

        cpu.set('a', 0x0042);

        var dump = cpu.getDump();
        assert.match(dump, /^A: *0042/mi);
    },

    'memory should be shown by CPU#getDump': function () {
        var cpu = new CPU();

        cpu.set(0x1000, 0x0042);

        var dump = cpu.getDump();
        assert.match(dump, /^1000: *0042/mi);
    },

    'PC should be indicated in memory dump': function () {
        var cpu = new CPU();

        cpu.set(0x1000, 0x0042);
        cpu.set('pc', 0x1000);

        var dump = cpu.getDump();
        assert.match(dump, /^1000: *\[0042\]/mi);
    },

    'SP should be indicated in memory dump': function () {
        var cpu = new CPU();

        cpu.set(0x1000, 0x0042);
        cpu.set('sp', 0x1000);

        var dump = cpu.getDump();
        assert.match(dump, /^1000: *\*0042\*/mi);
    },

    'get listeners should be invoked with the address offset as the argument': function () {
        var cpu = new CPU();
        var getListenerArguments = [];
        var order = 0;

        cpu.onGet(0x1000, 2, function (addr) { getListenerArguments.push(addr); });

        cpu.get(0x0fff);
        cpu.get(0x1002);

        cpu.get(0x1000);
        cpu.get(0x1001);

        assert.eql(getListenerArguments, [0, 1]);
    },

    'get listeners should be invoked in order': function () {
        var cpu = new CPU();
        var getListenerAInvoked = false;
        var getListenerBInvoked = false;
        var order = 0;

        cpu.onGet(0x1000, function () { getListenerAInvoked = order++; });
        cpu.onGet(0x1000, function () { getListenerBInvoked = order++; });

        cpu.get(0x1000);
        assert.equal(0, getListenerAInvoked);
        assert.equal(1, getListenerBInvoked);
    },

    'first get listener that returns a value should determine the return value': function () {
        var cpu = new CPU();
        var getListenerBInvoked = false;

        cpu.onGet(0x1000, function () { return 0x0042; });
        cpu.onGet(0x1000, function () { getListenerBInvoked = true; });

        var result = cpu.get(0x1000);
        assert.equal(0x0042, result);
        assert.equal(false, getListenerBInvoked);
    },

    'get listeners should be able to return a zero value': function () {
        var cpu = new CPU();

        cpu.onGet(0x1000, function () { return 0x0000; });

        cpu.set(0x1000, 0x0042);
        var result = cpu.get(0x1000);
        assert.equal(0x0000, result);
    },

    'set listeners should be invoked with the address offset and the value as arguments': function () {
        var cpu = new CPU();
        var setListenerArguments = [];
        var order = 0;

        cpu.onSet(0x1000, 2, function (addr, value) {
            setListenerArguments.push(addr);
            setListenerArguments.push(value);
        });

        cpu.set(0x0fff, 0x41);
        cpu.set(0x1002, 0x44);

        cpu.set(0x1000, 0x42);
        cpu.set(0x1001, 0x43);

        assert.eql(setListenerArguments, [0, 0x42, 1, 0x43]);
    },

    'set listeners should be invoked in order': function () {
        var cpu = new CPU();
        var setListenerAInvoked = false;
        var setListenerBInvoked = false;
        var order = 0;

        cpu.onSet(0x1000, function () { setListenerAInvoked = order++; });
        cpu.onSet(0x1000, function () { setListenerBInvoked = order++; });

        cpu.set(0x1000, 1);
        assert.equal(0, setListenerAInvoked);
        assert.equal(1, setListenerBInvoked);
    },

    'no more set listeners should be called after a listener returns true': function () {
        var cpu = new CPU();
        var setListenerAInvoked = false;
        var setListenerBInvoked = false;

        cpu.onSet(0x1000, function () {
            setListenerAInvoked = true;
            return true;
        });
        cpu.onSet(0x1000, function () { setListenerBInvoked = true; });

        cpu.set(0x1000, 0);
        assert.equal(true, setListenerAInvoked);
        assert.equal(false, setListenerBInvoked);
    },

    'end listeners should be called after the CPU stops running': function () {
        var endListenerInvoked = false;
        var cpu = new CPU();
        cpu.onEnd(function () { endListenerInvoked = true; });
        assembleOnCpu(cpu, ["BRK"]);
        cpu.run();
        assert.equal(true, endListenerInvoked);
    }
};
