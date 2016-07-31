function escapeHTML (str) {
    var div = document.createElement("div");
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
};

function unescapeHTML (escapedStr) {
    // Unsafe on untrusted strings, use only on trusted
    var div = document.createElement("div");
    div.innerHTML = escapedStr;
    var child = div.childNodes[0];
    return child ? child.nodeValue : "";
};

exports.escapeHTML = escapeHTML;
exports.unescapeHTML = unescapeHTML;
