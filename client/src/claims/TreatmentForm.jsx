import React, { useState } from 'react';
import { Activity, Hospital, Calendar, IndianRupee, BedDouble, ArrowRight } from 'lucide-react';
import { Spinner } from '../components/common/ui';

const ROOM_TYPE_OPTIONS = [
  'Single Private AC Room',
  'Shared / Twin Sharing Room',
  'General Ward',
  'Deluxe Room',
  'Super Deluxe / Suite',
  'ICU / Critical Care Unit',
];

export default function TreatmentForm({ initialData, onSubmit, loading }) {
  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    hospital: initialData?.hospital || '',
    admission_date: initialData?.admission_date || '',
    discharge_date: initialData?.discharge_date || '',
    room_type: initialData?.room_type || 'Single Private AC Room',
    estimated_cost: initialData?.estimated_cost ? String(initialData.estimated_cost) : '',
  });

  const [errors, setErrors] = useState({});

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: null }));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const newErrors = {};

    if (!formData.name.trim() || formData.name.trim().length < 2) {
      newErrors.name = 'Please provide a valid treatment or procedure name';
    }
    if (!formData.hospital.trim() || formData.hospital.trim().length < 2) {
      newErrors.hospital = 'Please enter the hospital name';
    }
    if (!formData.admission_date) {
      newErrors.admission_date = 'Admission date is required';
    }
    const costNum = parseFloat(formData.estimated_cost);
    if (!costNum || costNum <= 0) {
      newErrors.estimated_cost = 'Please enter a valid estimated or billed cost';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    onSubmit({
      name: formData.name.trim(),
      hospital: formData.hospital.trim(),
      admission_date: formData.admission_date,
      discharge_date: formData.discharge_date || null,
      room_type: formData.room_type,
      estimated_cost: costNum,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-[#062327]/10 rounded-3xl p-6 shadow-sm flex flex-col gap-6">
      <div>
        <h3 className="font-headline text-base font-bold text-[#062327] flex items-center gap-2">
          <Activity size={18} className="text-[#062327]" />
          Treatment & Hospitalization Details
        </h3>
        <p className="text-xs text-[#558187] mt-1 font-medium">
          Specify the planned or completed medical procedure to evaluate policy coverage and waiting periods.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Treatment Name */}
        <div>
          <label className="block text-xs font-bold text-[#062327] mb-1.5">
            Treatment / Diagnosis Name *
          </label>
          <input
            type="text"
            name="name"
            placeholder="e.g. Cataract Surgery, Total Knee Replacement"
            value={formData.name}
            onChange={handleChange}
            className={`w-full bg-[#f5f8f8] border rounded-2xl px-4 py-3 text-sm text-[#062327] font-medium placeholder-[#558187]/60 focus:bg-white focus:border-[#062327] focus:outline-none transition-all ${
              errors.name ? 'border-rose-500' : 'border-[#062327]/15'
            }`}
          />
          {errors.name && <p className="text-[11px] text-rose-600 font-semibold mt-1">{errors.name}</p>}
        </div>

        {/* Hospital Name */}
        <div>
          <label className="block text-xs font-bold text-[#062327] mb-1.5">
            Hospital / Healthcare Facility *
          </label>
          <input
            type="text"
            name="hospital"
            placeholder="e.g. Apollo Hospital, Fortis Healthcare"
            value={formData.hospital}
            onChange={handleChange}
            className={`w-full bg-[#f5f8f8] border rounded-2xl px-4 py-3 text-sm text-[#062327] font-medium placeholder-[#558187]/60 focus:bg-white focus:border-[#062327] focus:outline-none transition-all ${
              errors.hospital ? 'border-rose-500' : 'border-[#062327]/15'
            }`}
          />
          {errors.hospital && <p className="text-[11px] text-rose-600 font-semibold mt-1">{errors.hospital}</p>}
        </div>

        {/* Admission Date */}
        <div>
          <label className="block text-xs font-bold text-[#062327] mb-1.5">
            Admission Date *
          </label>
          <input
            type="date"
            name="admission_date"
            value={formData.admission_date}
            onChange={handleChange}
            className={`w-full bg-[#f5f8f8] border rounded-2xl px-4 py-3 text-sm text-[#062327] font-medium focus:bg-white focus:border-[#062327] focus:outline-none transition-all ${
              errors.admission_date ? 'border-rose-500' : 'border-[#062327]/15'
            }`}
          />
          {errors.admission_date && <p className="text-[11px] text-rose-600 font-semibold mt-1">{errors.admission_date}</p>}
        </div>

        {/* Discharge Date */}
        <div>
          <label className="block text-xs font-bold text-[#062327] mb-1.5">
            Discharge Date <span className="text-[#558187] font-normal">(Optional if currently admitted)</span>
          </label>
          <input
            type="date"
            name="discharge_date"
            value={formData.discharge_date}
            onChange={handleChange}
            className="w-full bg-[#f5f8f8] border border-[#062327]/15 rounded-2xl px-4 py-3 text-sm text-[#062327] font-medium focus:bg-white focus:border-[#062327] focus:outline-none transition-all"
          />
        </div>

        {/* Room Type */}
        <div>
          <label className="block text-xs font-bold text-[#062327] mb-1.5">
            Room Type / Category *
          </label>
          <select
            name="room_type"
            value={formData.room_type}
            onChange={handleChange}
            className="w-full bg-[#f5f8f8] border border-[#062327]/15 rounded-2xl px-4 py-3 text-sm text-[#062327] font-medium focus:bg-white focus:border-[#062327] focus:outline-none transition-all cursor-pointer"
          >
            {ROOM_TYPE_OPTIONS.map(opt => (
              <option key={opt} value={opt} className="bg-white text-[#062327]">
                {opt}
              </option>
            ))}
          </select>
        </div>

        {/* Estimated / Billed Cost */}
        <div>
          <label className="block text-xs font-bold text-[#062327] mb-1.5">
            Estimated or Billed Cost (INR ₹) *
          </label>
          <input
            type="number"
            step="any"
            name="estimated_cost"
            placeholder="e.g. 150000"
            value={formData.estimated_cost}
            onChange={handleChange}
            className={`w-full bg-[#f5f8f8] border rounded-2xl px-4 py-3 text-sm text-[#062327] font-medium placeholder-[#558187]/60 focus:bg-white focus:border-[#062327] focus:outline-none transition-all ${
              errors.estimated_cost ? 'border-rose-500' : 'border-[#062327]/15'
            }`}
          />
          {errors.estimated_cost && <p className="text-[11px] text-rose-600 font-semibold mt-1">{errors.estimated_cost}</p>}
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={loading}
          className="btn-pill-lime py-3 px-6 text-xs sm:text-sm font-bold shadow-md cursor-pointer flex items-center gap-2"
        >
          {loading ? (
            <>
              <Spinner size="xs" />
              <span>Saving & Evaluating Eligibility...</span>
            </>
          ) : (
            <>
              <span>Save & Check Policy Eligibility</span>
              <ArrowRight size={14} />
            </>
          )}
        </button>
      </div>
    </form>
  );
}
