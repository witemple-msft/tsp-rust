import "../dist/index.js";

namespace TypeSpec;

/**
 * An unsigned index value, conceptually equivalent to usize_t from stdint.h.
 * 
 * The actual size of this type is platform-dependent.
 */
scalar usize extends safeint;

/**
 * A signed index value, conceptually equivalent to ssize_t from stdint.h.
 * 
 * The actual size of this type is platform-dependent.
 */
scalar isize extends safeint;