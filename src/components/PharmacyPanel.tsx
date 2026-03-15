// src/components/PharmacyPanel.tsx - Pharmacy integration panel
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Package, MapPin, Phone, Truck, Clock, CheckCircle, ExternalLink } from 'lucide-react';
import { NEARBY_PHARMACIES, createRefillRequest, getRefillRequests } from '@/lib/pharmacy';

interface PharmacyPanelProps {
  patientId: string;
  patientName: string;
  medicine: { id: string; name: string; dosage: string };
  prescriptionId?: string;
}

const PharmacyPanel = ({ patientId, patientName, medicine, prescriptionId }: PharmacyPanelProps) => {
  const [showModal, setShowModal] = useState(false);
  const [selectedPharmacy, setSelectedPharmacy] = useState(NEARBY_PHARMACIES[0]);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [requests] = useState(() => getRefillRequests(patientId));

  const handleSubmit = () => {
    createRefillRequest({
      prescriptionId: prescriptionId || 'manual',
      patientId, patientName,
      medicineName: `${medicine.name} ${medicine.dosage}`,
      pharmacyId: selectedPharmacy.id,
      pharmacyName: selectedPharmacy.name,
      notes: `Refill request for ${medicine.name}`,
      deliveryAddress: selectedPharmacy.deliveryAvailable ? deliveryAddress : undefined,
    });
    setSubmitted(true);
    setTimeout(() => { setShowModal(false); setSubmitted(false); }, 2000);
  };

  return (
    <>
      <Button size="sm" variant="outline" className="border-green-300 text-green-700 hover:bg-green-50 h-8 px-3 text-xs"
        onClick={() => setShowModal(true)}>
        <Package className="h-3.5 w-3.5 mr-1"/>Request Refill
      </Button>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="bg-white max-w-md" aria-describedby="pharm-desc">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-green-600"/>Refill Request
            </DialogTitle>
          </DialogHeader>
          <p id="pharm-desc" className="text-sm text-gray-600">Request a refill for <strong>{medicine.name} {medicine.dosage}</strong></p>

          {submitted ? (
            <div className="py-8 text-center">
              <CheckCircle className="h-14 w-14 text-green-500 mx-auto mb-3"/>
              <p className="font-semibold text-gray-900">Request Sent!</p>
              <p className="text-sm text-gray-500 mt-1">Your refill request has been submitted to {selectedPharmacy.name}.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Pharmacy selection */}
              <div>
                <Label className="text-sm font-medium text-gray-700 mb-2 block">Select Pharmacy</Label>
                <div className="space-y-2 max-h-52 overflow-y-auto">
                  {NEARBY_PHARMACIES.map(p => (
                    <label key={p.id} className={`flex items-center justify-between p-3 border-2 rounded-xl cursor-pointer transition-colors ${selectedPharmacy.id===p.id?'border-green-500 bg-green-50':'border-gray-200 hover:border-gray-300'}`}>
                      <div className="flex items-center gap-2">
                        <input type="radio" name="pharmacy" className="sr-only" checked={selectedPharmacy.id===p.id} onChange={() => setSelectedPharmacy(p)}/>
                        <div>
                          <p className="font-medium text-gray-900 text-sm">{p.name}</p>
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <MapPin className="h-3 w-3"/><span>{p.distance > 0 ? `${p.distance}km` : 'Online'}</span>
                            {p.open24h && <span className="text-green-600 font-medium">24h</span>}
                            {p.deliveryAvailable && <span className="text-blue-600 flex items-center gap-0.5"><Truck className="h-3 w-3"/>Delivery</span>}
                          </div>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Delivery address */}
              {selectedPharmacy.deliveryAvailable && (
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-gray-700">Delivery Address (optional)</Label>
                  <Input placeholder="Enter delivery address" value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} className="border-gray-300 bg-white h-10 text-sm"/>
                </div>
              )}

              <div className="flex gap-3">
                <Button className="flex-1 bg-green-600 hover:bg-green-700 text-white h-10 font-semibold" onClick={handleSubmit}>
                  <Package className="h-4 w-4 mr-2"/>Submit Request
                </Button>
                <Button variant="outline" className="border-gray-300 text-gray-700 h-10 px-4" onClick={() => setShowModal(false)}>Cancel</Button>
              </div>

              {/* Contact pharmacy directly */}
              <div className="pt-1 text-center">
                <a href={`tel:${selectedPharmacy.phone}`} className="text-xs text-blue-600 flex items-center justify-center gap-1 hover:underline">
                  <Phone className="h-3 w-3"/>{selectedPharmacy.phone}
                </a>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default PharmacyPanel;
