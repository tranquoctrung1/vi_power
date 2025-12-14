function formatDate(d) {
    const date = new Date(d);
    const pad = (n) => String(n).padStart(2, '0');

    return (
        pad(date.getDate()) +
        '/' +
        pad(date.getMonth() + 1) +
        '/' +
        date.getFullYear() +
        ' ' +
        pad(date.getHours()) +
        ':' +
        pad(date.getMinutes()) +
        ':' +
        pad(date.getSeconds())
    );
}
