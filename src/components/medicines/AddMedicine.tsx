// This file can now be a simple wrapper that redirects
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const AddMedicine = () => {
  const navigate = useNavigate();
  
  useEffect(() => {
    navigate('/medicines/add');
  }, [navigate]);
  
  return null;
};

export default AddMedicine;