const express = require('express'),
    app = express();
app.use(express.static(`${__dirname}/public`));
const server = app.listen(3000, () => {
    const port = server.address().port;
    console.log(`Running on port ${port}`);
});
