set scriptFile to POSIX file "/Users/ncst/Develop/illustrator-mcp/illustrator-mcp-tmp/message-1773575389175-84c5c867.jsx"
tell application "Adobe Illustrator"
    set resultText to do javascript of scriptFile
end tell
return resultText