/**
 * These abstractions rely on NodeJS's cluster module, which allows a parent (master) process to share
 * code with its children (workers). A simple `isMaster` flag indicates who is trying to access
 * the code, and thus determines the functionality that actually gets invoked (checked by the caller, not internally).
 * 
 * Think of the master thread as a factory, and the workers as the helpers that actually run the server.
 * 
 * So, when we run `npm start`, given the appropriate check, initializeMaster() is called in the parent process
 * This will spawn off its own child process (by default, mirrors the execution path of its parent),
 * in which initializeWorker() is invoked.
 */