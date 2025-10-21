const fengari = require('fengari');
const lua = fengari.lua;
const lauxlib = fengari.lauxlib;
const lualib = fengari.lualib;

describe('test-coroutine', () => {
    it('should work', () => {
        // Import some stuff from fengari
        global.WEB = false;
        const {
            lua: {
                lua_pushnil,
                lua_tointeger,
                lua_touserdata,
                lua_atnativeerror,
                lua_yield,
                lua_resume,
                lua_pushjsfunction,
                lua_setglobal,
                lua_pushliteral,
                lua_tostring,
            },
            lauxlib: { luaL_newstate, luaL_loadstring },
            lualib: { luaL_openlibs },
        } = require('fengari');

        // Define some custom global functions
        const api = {
            // Used to test returning values from custom native functions
            hello(L) {
                lua_pushliteral(L, 'Hello World');
                return 1;
            },
            // Used to test pausing and resuming a coroutine.
            delay(L) {
                setTimeout(
                    () => {
                        lua_resume(L, null, 0);
                    },
                    lua_tointeger(L, -1)
                );
                return lua_yield(L, 0);
            },
            // Another example, but promise based
            delay2(L) {
                return pwait(L, pdelay(lua_tointeger(L, -1)));
            },
        };

        function pwait(L, promise) {
            promise
                .then((res) => {
                    lua_pushliteral(L, res);
                    lua_resume(L, null, 1);
                })
                .catch((err) => {
                    lua_pushnil(L);
                    lua_pushliteral(L, '' + err);
                    lua_resume(L, null, 2);
                });
            return lua_yield(L, 0);
        }

        function pdelay(ms) {
            return new Promise((resolve) => setTimeout(resolve, ms));
        }

        function main() {
            // Create a new state with default globals
            let L = luaL_newstate();
            luaL_openlibs(L);

            // Inject API functions into globals
            for (let key in api) {
                lua_pushjsfunction(L, api[key]);
                lua_setglobal(L, key);
            }

            // Report native errors
            lua_atnativeerror(L, (L) => {
                console.error(lua_touserdata(L, 1));
                return 1;
            });

            // Run some lua code in a coroutine
            luaL_loadstring(
                L,
                `
    print(hello())
    print "Starting Delay"
    for i=1,10 do
      delay(100)
      print "tick"
    end
    delay2(300)
    print "tock!"
  `
            );
            lua_resume(L, null, 0);
        }

        main();
    });
});
