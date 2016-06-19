// footerScripts helper
// usage: `{{#footerScripts}}`
// Checks whether a scripts element is present in the context. If not, default to serving jquery

function footerScripts () {
    if (this.scripts) {
        return "<script src='" + this.scripts + "'></script>"
    }
    
    return '<script src="https://code.jquery.com/jquery-2.2.4.min.js" integrity="sha256-BbhdlvQf/xTY9gja0Dq3HiwQF8LaCRTXxZKRutelT44=" crossorigin="anonymous"></script>'
};

module.exports = footerScripts;