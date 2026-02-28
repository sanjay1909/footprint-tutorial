"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createScopeProxyFromZod = exports.isScopeSchema = exports.defineScopeSchema = exports.ZodScopeResolver = exports.defineScopeFromZod = void 0;
var defineScopeFromZod_1 = require("./defineScopeFromZod");
Object.defineProperty(exports, "defineScopeFromZod", { enumerable: true, get: function () { return defineScopeFromZod_1.defineScopeFromZod; } });
var resolver_1 = require("./resolver");
Object.defineProperty(exports, "ZodScopeResolver", { enumerable: true, get: function () { return resolver_1.ZodScopeResolver; } });
var builder_1 = require("./schema/builder");
Object.defineProperty(exports, "defineScopeSchema", { enumerable: true, get: function () { return builder_1.defineScopeSchema; } });
Object.defineProperty(exports, "isScopeSchema", { enumerable: true, get: function () { return builder_1.isScopeSchema; } });
var scopeFactory_1 = require("./scopeFactory");
Object.defineProperty(exports, "createScopeProxyFromZod", { enumerable: true, get: function () { return scopeFactory_1.createScopeProxyFromZod; } });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvc2NvcGUvc3RhdGUvem9kL2luZGV4LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLDJEQUEwRDtBQUFqRCx3SEFBQSxrQkFBa0IsT0FBQTtBQUMzQix1Q0FBOEM7QUFBckMsNEdBQUEsZ0JBQWdCLE9BQUE7QUFDekIsNENBQW9FO0FBQTNELDRHQUFBLGlCQUFpQixPQUFBO0FBQUUsd0dBQUEsYUFBYSxPQUFBO0FBQ3pDLCtDQUF5RDtBQUFoRCx1SEFBQSx1QkFBdUIsT0FBQSIsInNvdXJjZXNDb250ZW50IjpbImV4cG9ydCB7IGRlZmluZVNjb3BlRnJvbVpvZCB9IGZyb20gJy4vZGVmaW5lU2NvcGVGcm9tWm9kJztcbmV4cG9ydCB7IFpvZFNjb3BlUmVzb2x2ZXIgfSBmcm9tICcuL3Jlc29sdmVyJztcbmV4cG9ydCB7IGRlZmluZVNjb3BlU2NoZW1hLCBpc1Njb3BlU2NoZW1hIH0gZnJvbSAnLi9zY2hlbWEvYnVpbGRlcic7XG5leHBvcnQgeyBjcmVhdGVTY29wZVByb3h5RnJvbVpvZCB9IGZyb20gJy4vc2NvcGVGYWN0b3J5JztcbiJdfQ==