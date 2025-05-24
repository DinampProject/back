import swaggerJsDoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

const options = {
    definition: {
        openapi: "3.0.0",
        info: {
            title: "API Documentation",
            version: "1.0.0",
            description: "Swagger API documentation for the backend",
        },
        servers: [
            {
                url: "http://localhost:4000", // Update this for your production URL
            },
        ],
    },
    apis: ["./routes/*.js"], // ✅ Ensure it scans all route files
};

const swaggerSpecs = swaggerJsDoc(options);

const setupSwagger = (app) => {
    app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpecs));
};

export default setupSwagger;
