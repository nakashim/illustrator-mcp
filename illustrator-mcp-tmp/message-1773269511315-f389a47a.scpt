set scriptFile to POSIX file "/Users/ncst/Develop/illustrator-mcp/illustrator-mcp-tmp/message-1773269511315-f389a47a.jsx"
tell application "Adobe Illustrator"
    set resultText to do javascript of scriptFile
end tell
return resultText