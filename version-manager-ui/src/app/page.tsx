'use client';

import { useEffect, useState } from 'react';

export default function UploadPage() {
  const [builds, setBuilds] = useState<any[]>([]);
  const [progress, setProgress] = useState(0);
  const [showLogin, setShowLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  useEffect(() => {
    // Try auto-login from localStorage
    const storedToken = localStorage.getItem('token');
    const storedRole = localStorage.getItem('role');
    if (storedToken && storedRole) {
      setToken(storedToken);
      setRole(storedRole);
      setShowLogin(false);
      fetchBuilds(storedToken);
    }
  }, []);

  const fetchBuilds = async (jwt?: string | null) => {
    try {
        const res = await fetch('http://3.6.254.133:3001/builds', {
        headers: jwt ? { Authorization: `Bearer ${jwt}` } : {},
      });
      if (res.status === 401 || res.status === 403) {
        setShowLogin(true);
        setToken(null);
        setRole(null);
        localStorage.removeItem('token');
        localStorage.removeItem('role');
        return;
      }
      const data = await res.json();
      setBuilds(data);
    } catch (err) {
      console.error('Failed to load builds', err);
    }
  };
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    try {
      const res = await fetch('http://3.6.254.133:3001/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        setLoginError('Invalid credentials');
        return;
      }
      const data = await res.json();
      setToken(data.token);
      setRole(data.role);
      localStorage.setItem('token', data.token);
      localStorage.setItem('role', data.role);
      setShowLogin(false);
      fetchBuilds(data.token);
    } catch {
      setLoginError('Login failed');
    }
  };
  const handleLogout = () => {
    setToken(null);
    setRole(null);
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    setShowLogin(true);
    setBuilds([]);
    setUsername('');
    setPassword('');
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!token) {
      setShowLogin(true);
      return;
    }
    const form = e.currentTarget;
    const formData = new FormData(form);

    try {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', 'http://3.6.254.133:3001/upload');
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);

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
    if (!token) {
      setShowLogin(true);
      return;
    }
    if (!confirm('Are you sure you want to delete this build?')) return;
    try {
      const res = await fetch(`http://3.6.254.133:3001/builds/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Delete failed');
      alert('Build deleted');
      fetchBuilds(token);
    } catch (err) {
      console.log(err);
      alert('Failed to delete build.');
    }
  };

    return (
    <>
      {showLogin && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <form
            onSubmit={handleLogin}
            className="bg-white p-8 rounded shadow-md w-full max-w-xs flex flex-col gap-4"
          >
            <h2 className="text-xl font-bold mb-2 text-center">Login</h2>
            <input
              type="text"
              placeholder="Username"
              className="border px-3 py-2 rounded"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoFocus
              required
            />
            <input
              type="password"
              placeholder="Password"
              className="border px-3 py-2 rounded"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
            {loginError && <div className="text-red-600 text-sm">{loginError}</div>}
            <button
              type="submit"
              className="bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
            >
              Login
            </button>
          </form>
        </div>
      )}

      <div className="bg-gray-100 min-h-screen py-10 px-4">
        <div className="max-w-5xl mx-auto bg-white p-6 rounded shadow">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-center flex-1">Upload Build</h2>
            {token && (
              <button
                onClick={handleLogout}
                className="bg-gray-300 text-gray-800 px-4 py-2 rounded ml-4"
              >
                Logout
              </button>
            )}
          </div>
          {role === 'admin' ? (
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
          ) : (
            <div className="text-center text-gray-500 py-8">
              {role === 'viewer'
                ? 'You have viewer access. Uploading is disabled.'
                : 'Please login to upload builds.'}
            </div>
          )}
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
                  {role === 'admin' && <th className="p-2">Actions</th>}
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
                      <a href={b.file_path} className="text-blue-600 underline" target="_blank" rel="noopener noreferrer">
                        Download
                      </a>
                    </td>
                    {role === 'admin' && (
                      <td className="p-2">
                        <button
                          onClick={() => deleteBuild(b.id)}
                          className="bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700"
                        >
                          Delete
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {builds.length === 0 && (
                  <tr>
                    <td colSpan={role === 'admin' ? 12 : 11} className="text-center py-4">
                      No builds found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
