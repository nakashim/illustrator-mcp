set scriptFile to POSIX file "/Users/ncst/Develop/illustrator-mcp/illustrator-mcp-tmp/message-1773574933096-51318fdd.jsx"
tell application "Adobe Illustrator"
    set resultText to do javascript of scriptFile
end tell
return resultText