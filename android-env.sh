# Source this before native Android builds:  source ./android-env.sh
# (or add these lines to your ~/.bashrc to make them permanent)

export JAVA_HOME="$(ls -d /home/gilles/.local/jdk/jdk-17* 2>/dev/null | head -1)"
export ANDROID_HOME="$HOME/Android/Sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
