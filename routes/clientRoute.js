    import express from 'express';
    import { getClients, createClient, updateClient, deleteClient } from '../controllers/clientController.js';
    
    const router = express.Router();
    router.get('/getClients', getClients);
    router.post('/createClient', createClient);
    router.put('/updateClient', updateClient);
    router.delete('/deleteClient', deleteClient);
    
    export default router;