set scriptFile to POSIX file "/Users/ncst/Develop/illustrator-mcp/illustrator-mcp-tmp/message-1773472754083-63fde1a6.jsx"
tell application "Adobe Illustrator"
    set resultText to do javascript of scriptFile
end tell
return resultText