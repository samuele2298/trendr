'use strict';

const fs = require('fs');
const path = require('path');

class JSONDatabase {
    constructor() {
        this.dataPath = path.join(__dirname, 'public');
    }

    // Legge un file JSON
    read(fileName) {
        try {
            const filePath = path.join(this.dataPath, `${fileName}.json`);
            const data = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.log(`Error reading ${fileName}.json:`, error);
            return [];
        }
    }

    // Scrive un file JSON
    write(fileName, data) {
        try {
            const filePath = path.join(this.dataPath, `${fileName}.json`);
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
            return true;
        } catch (error) {
            console.log(`Error writing ${fileName}.json:`, error);
            return false;
        }
    }

    // Aggiunge un elemento a un file JSON
    add(fileName, item) {
        const data = this.read(fileName);
        data.push(item);
        return this.write(fileName, data);
    }

    // Trova elementi in un file JSON
    find(fileName, filter = {}) {
        const data = this.read(fileName);
        if (Object.keys(filter).length === 0) return data;
        
        return data.filter(item => {
            return Object.keys(filter).every(key => item[key] === filter[key]);
        });
    }

    // Trova un elemento per ID
    findById(fileName, id) {
        const data = this.read(fileName);
        return data.find(item => item.id == id);
    }

    // Aggiorna un elemento
    update(fileName, id, updates) {
        const data = this.read(fileName);
        const index = data.findIndex(item => item.id === id);
        if (index !== -1) {
            data[index] = { ...data[index], ...updates };
            return this.write(fileName, data);
        }
        return false;
    }

    // Elimina un elemento
    delete(fileName, id) {
        const data = this.read(fileName);
        const filteredData = data.filter(item => item.id !== id);
        return this.write(fileName, filteredData);
    }
}

const db = new JSONDatabase();

module.exports = db;
