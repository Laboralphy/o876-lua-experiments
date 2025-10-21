const LuaProgram = require('./LuaProgram');

describe('async', () => {
    it('should run something', async () => {
        const l = new LuaProgram();
        const f = async (n) => {
            return 2 * n;
        };
        let result = 0;
        l.bindFunction('exportResult', (n) => {
            result = n;
        });
        l.bindFunction('fasync', f);
        const co = l.runCoroutineGenerator(`
        x = fasync(32)
        exportResult(45)
        `);
        for (const result of co) {
            console.log(result);
        }
    });
});
