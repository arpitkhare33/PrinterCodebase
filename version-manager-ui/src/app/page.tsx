'use client';

import { useEffect, useState } from 'react';

export default function UploadPage() {
  const [builds, setBuilds] = useState<any[]>([]);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    fetchBuilds();
  }, []);

  const fetchBuilds = async () => {
    try {
      const res = await fetch('http://3.6.254.133:3000/builds');
      const data = await res.json();
      setBuilds(data);
    } catch (err) {
      console.error('Failed to load builds', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);

    try {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', 'http://3.6.254.133:3000/upload');

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          setProgress(percent);
        }
      };

      xhr.onload = () => {
        if (xhr.status === 200) {
          alert('Upload successful');
          form.reset();
          setProgress(0);
          fetchBuilds();
        } else {
          alert('Upload failed: ' + xhr.responseText);
        }
      };

      xhr.onerror = () => alert('Upload failed due to a network error');
      xhr.send(formData);
    } catch (err) {
      console.error('Upload error', err);
    }
  };

  const deleteBuild = async (id: number) => {
    if (!confirm('Are you sure you want to delete this build?')) return;
    try {
      const res = await fetch(`http://3.6.254.133:3000/builds/${id}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Delete failed');
      alert('Build deleted');
      fetchBuilds();
    } catch (err) {
      alert('Failed to delete build.');
    }
  };

  return (
    <div className="bg-gray-100 min-h-screen py-10 px-4">
      <div className="max-w-5xl mx-auto bg-white p-6 rounded shadow">
        <h2 className="text-2xl font-bold mb-6 text-center">Upload Build</h2>
        <form onSubmit={handleSubmit} className="space-y-4" encType="multipart/form-data">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input name="build" required className="input p-2 border-1 border-solid rounded-sm" placeholder="Build Name" />
            <input name="version" className="input p-2 border-1 border-solid rounded-sm" placeholder="Build Number" />
            <input name="printer_type" required className="input p-2 border-1 border-solid rounded-sm" placeholder="Printer Type" />
            <input name="sub_type" required className="input p-2 border-1 border-solid rounded-sm" placeholder="Sub Type" />
            <input name="make" required className="input p-2 border-1 border-solid rounded-sm" placeholder="Make" />
            <input name="uploader" required className="input p-2 border-1 border-solid rounded-sm" placeholder="Uploader Name" />
          </div>
          <textarea name="description" rows={2} className="w-full border px-3 py-2 rounded" placeholder="Description" />
          <input type="file" name="zipFile" required accept=".zip" className="block w-full border px-3 py-2 rounded" />
          <button type="submit" className="bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 mt-4">
            Upload Build
          </button>
          <div className="w-full bg-gray-300 rounded-full h-6 mt-4">
            <div
              className="bg-green-500 text-white text-sm text-center h-6 rounded-full"
              style={{ width: `${progress}%` }}
            >
              {progress}%
            </div>
          </div>
        </form>
      </div>

      <div className="max-w-7xl mx-auto mt-10 bg-white p-6 rounded shadow">
        <h2 className="text-xl font-semibold mb-4 text-center">Uploaded Builds</h2>
        <div className="overflow-x-auto">
          <table className="table-auto w-full text-sm text-left border border-gray-200">
            <thead className="bg-gray-800 text-white">
              <tr>
                <th className="p-2">ID</th>
                <th className="p-2">Name</th>
                <th className="p-2">Build Number</th>
                <th className="p-2">Description</th>
                <th className="p-2">Uploaded By</th>
                <th className="p-2">Upload Time</th>
                <th className="p-2">Printer Type</th>
                <th className="p-2">Sub Type</th>
                <th className="p-2">Make</th>
                <th className="p-2">Size (MB)</th>
                <th className="p-2">File</th>
                <th className="p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {builds.map((b) => (
                <tr key={b.id} className="border-b">
                  <td className="p-2">{b.id}</td>
                  <td className="p-2">{b.name}</td>
                  <td className="p-2">{b.version || ''}</td>
                  <td className="p-2">{b.description || ''}</td>
                  <td className="p-2">{b.uploaded_by || ''}</td>
                  <td className="p-2">{b.upload_time || ''}</td>
                  <td className="p-2">{b.printer_type || ''}</td>
                  <td className="p-2">{b.sub_type || ''}</td>
                  <td className="p-2">{b.make || ''}</td>
                  <td className="p-2">{b.size || ''}</td>
                  <td className="p-2">
                    <a href={b.file_path} className="text-blue-600 underline" target="_blank">
                      Download
                    </a>
                  </td>
                  <td className="p-2">
                    <button
                      onClick={() => deleteBuild(b.id)}
                      className="bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {builds.length === 0 && (
                <tr>
                  <td colSpan={12} className="text-center py-4">
                    No builds found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
