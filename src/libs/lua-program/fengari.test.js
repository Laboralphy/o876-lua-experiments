const fengari = require('fengari');

const lua = fengari.lua;

describe('Test lua_next, does it pop last key ?', () => {
    it('0.1.4 should pop out last key after lua_next returns 0', function () {});
    const l = lua.lua_newstate();
    lua.lua_newtable(l);
    lua.lua_pushstring(l, 'alpha');
    lua.lua_pushstring(l, 'value_alpha');
    lua.lua_settable(l, -3); // [table]

    lua.lua_pushvalue(l, -1); // [table, table_copy]
    lua.lua_pushnil(l); // [table, table_copy, nil]

    let hasNext;

    // first iteration
    hasNext = lua.lua_next(l, -2); // [table, table_copy, key, value]
    // should fetch the one and only entry : [alpha, alpha_value]
    expect(hasNext).toBe(1); // lua_next could find entry
    expect(lua.lua_gettop(l)).toBe(4); // stack size is currently 4 : [table, table_copy, key, value]
    expect(lua.lua_tojsstring(l, -1)).toBe('value_alpha'); // top stack item is entry value
    expect(lua.lua_tojsstring(l, -2)).toBe('alpha'); // under top stack item is entry key
    lua.lua_pop(l, 1); // remove top stack item, we keep key
    expect(lua.lua_tojsstring(l, -1)).toBe('alpha'); // new top stack item is the current key

    // second iteration, lua_next will see "alpha" on top of stack and will try to get nex entry
    hasNext = lua.lua_next(l, -2);

    expect(hasNext).toBe(0); // lua_next did not find any other entry

    expect(lua.lua_gettop(l)).toBe(2); // lua_next seems to have popped out the remaining key
    expect(lua.lua_tojsstring(l, -1)).not.toBe('alpha'); // new top stack item should not be the previous table entry key

    // if test pass, then lua_next pops out last entry key and return 0 to notify end of iterations

    lua.lua_close(l);
});
