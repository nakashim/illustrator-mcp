set scriptFile to POSIX file "/Users/ncst/Develop/illustrator-mcp/illustrator-mcp-tmp/message-1773579392319-2cecea86.jsx"
tell application "Adobe Illustrator"
    set resultText to do javascript of scriptFile
end tell
return resultText