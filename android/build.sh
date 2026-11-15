#!/bin/bash
# ./build.sh <versionCode> <versionName>
set -e
cd "$(dirname "$0")"
export ANDROID_HOME=/home/claude/android-sdk SB_KS_PASS=$(cat keystore/pass.txt)
echo "sdk.dir=$ANDROID_HOME" > local.properties
/home/claude/gradle-8.7/bin/gradle -q assembleRelease -Pvcode=$1 -Pvname=$2 --no-daemon
ls -la app/build/outputs/apk/release/
