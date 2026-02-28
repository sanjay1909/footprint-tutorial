"use strict";
/**
 * Barrel export for the narrative generation module.
 *
 * WHY: Provides a single import point for consumers and internal modules
 * that need the narrative interface and its implementations. Keeps import
 * paths clean and decouples consumers from the internal file structure.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.NullNarrativeGenerator = exports.NarrativeGenerator = void 0;
var NarrativeGenerator_1 = require("./NarrativeGenerator");
Object.defineProperty(exports, "NarrativeGenerator", { enumerable: true, get: function () { return NarrativeGenerator_1.NarrativeGenerator; } });
var NullNarrativeGenerator_1 = require("./NullNarrativeGenerator");
Object.defineProperty(exports, "NullNarrativeGenerator", { enumerable: true, get: function () { return NullNarrativeGenerator_1.NullNarrativeGenerator; } });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvY29yZS9leGVjdXRvci9uYXJyYXRpdmUvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7R0FNRzs7O0FBR0gsMkRBQTBEO0FBQWpELHdIQUFBLGtCQUFrQixPQUFBO0FBQzNCLG1FQUFrRTtBQUF6RCxnSUFBQSxzQkFBc0IsT0FBQSIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQmFycmVsIGV4cG9ydCBmb3IgdGhlIG5hcnJhdGl2ZSBnZW5lcmF0aW9uIG1vZHVsZS5cbiAqXG4gKiBXSFk6IFByb3ZpZGVzIGEgc2luZ2xlIGltcG9ydCBwb2ludCBmb3IgY29uc3VtZXJzIGFuZCBpbnRlcm5hbCBtb2R1bGVzXG4gKiB0aGF0IG5lZWQgdGhlIG5hcnJhdGl2ZSBpbnRlcmZhY2UgYW5kIGl0cyBpbXBsZW1lbnRhdGlvbnMuIEtlZXBzIGltcG9ydFxuICogcGF0aHMgY2xlYW4gYW5kIGRlY291cGxlcyBjb25zdW1lcnMgZnJvbSB0aGUgaW50ZXJuYWwgZmlsZSBzdHJ1Y3R1cmUuXG4gKi9cblxuZXhwb3J0IHsgSU5hcnJhdGl2ZUdlbmVyYXRvciB9IGZyb20gJy4vdHlwZXMnO1xuZXhwb3J0IHsgTmFycmF0aXZlR2VuZXJhdG9yIH0gZnJvbSAnLi9OYXJyYXRpdmVHZW5lcmF0b3InO1xuZXhwb3J0IHsgTnVsbE5hcnJhdGl2ZUdlbmVyYXRvciB9IGZyb20gJy4vTnVsbE5hcnJhdGl2ZUdlbmVyYXRvcic7XG4iXX0=