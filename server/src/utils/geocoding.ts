import * as dotenv from 'dotenv';
dotenv.config();

export async function geocodeAddress(address?: string, cep?: string, bairro?: string, numero?: string, cidade?: string, estado?: string, pais?: string): Promise<{ latitude: string; longitude: string } | null> {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY?.replace(/"/g, ''); // Ensure quotes are stripped if added

    if (!apiKey) {
        console.error("Geocoding failed: GOOGLE_MAPS_API_KEY is not set in the environment.");
        return null;
    }

    try {
        let queryParts = [];

        if (address) {
            let addr = address.trim();
            if (numero) addr += `, ${numero.trim()}`;
            queryParts.push(addr);
        }

        if (bairro) {
            queryParts.push(bairro.trim());
        }

        if (cep) {
            const cleanCep = cep.replace(/\D/g, '');
            if (cleanCep.length === 8) {
                const formattedCep = `${cleanCep.substring(0, 5)}-${cleanCep.substring(5, 8)}`;
                queryParts.push(formattedCep);
            }
        }
        
        const isBrasil = !pais || pais.trim().toLowerCase() === 'brasil';

        if (cidade) queryParts.push(cidade.trim());
        else if (isBrasil) queryParts.push('Rio de Janeiro');

        if (estado) queryParts.push(estado.trim());
        else if (isBrasil) queryParts.push('RJ');

        queryParts.push(pais ? pais.trim() : 'Brasil');

        const query = queryParts.join(', ');
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${apiKey}`;

        const response = await fetch(url);

        if (response.ok) {
            const data: any = await response.json();
            
            if (data.status === 'OK' && data.results && data.results.length > 0) {
                const location = data.results[0].geometry.location;
                return {
                    latitude: location.lat.toString(),
                    longitude: location.lng.toString()
                };
            } else if (data.status === 'ZERO_RESULTS') {
                return null; // Not found, which is an expected outcome sometimes
            } else {
                console.error(`Google Geocoding API returned status: ${data.status}`, data.error_message || '');
                return null;
            }
        } else {
            console.error(`Google Geocoding API request failed with status: ${response.status}`);
            return null;
        }

    } catch (error) {
        console.error("Geocoding failed with exception:", error);
        return null;
    }
}
